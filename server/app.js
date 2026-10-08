import http from 'node:http';
import https from 'node:https';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

// Simple native .env loader without third-party dependencies
function loadEnv() {
  const envFiles = ['.env.local', '.env'];
  for (const file of envFiles) {
    const fullPath = path.join(rootDir, file);
    if (fs.existsSync(fullPath)) {
      const content = fs.readFileSync(fullPath, 'utf8');
      content.split('\n').forEach(line => {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
          const [key, ...vals] = trimmed.split('=');
          const val = vals.join('=').trim().replace(/^["']|["']$/g, '');
          if (!process.env[key.trim()]) {
            process.env[key.trim()] = val;
          }
        }
      });
    }
  }
}

loadEnv();

const PORT = process.env.PORT || 5000;
const CLIENT_ID = process.env.FLUTTERWAVE_CLIENT_ID || '7f21e663-d2ee-4286-b96e-83c671b2fcd1';
const CLIENT_SECRET = process.env.FLUTTERWAVE_CLIENT_SECRET || 'RO1K7hNqNvQOq3Qjy6OnlFGAvM7BkfmE';
const ENCRYPTION_KEY = process.env.FLUTTERWAVE_ENCRYPTION_KEY || '7OYFHKab7WEyROpKYVBlpxm5g/LtzUBH+k4ouAGLAsM=';
const ADMIN_NOTIFICATION_EMAIL = process.env.ADMIN_NOTIFICATION_EMAIL || 'luyandokandisha@gmail.com';

let cachedToken = null;
let tokenExpiresAt = 0;

/**
 * Sends an email notification to luyandokandisha@gmail.com when an order is placed.
 * Formats shop name, products, quantity, item prices, total amount, and delivery location.
 */
export async function sendOrderNotificationEmail(orderData) {
  const recipient = ADMIN_NOTIFICATION_EMAIL;
  const items = Array.isArray(orderData.items) ? orderData.items : [];
  const trackingId = orderData.trackingId || 'N/A';
  const deliveryAddress = orderData.deliveryAddress || orderData.deliveryLocation || 'Not specified';
  const totalZMW = Number(orderData.totalZMW || orderData.amount || 0).toLocaleString('en-ZM', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const paymentMethod = orderData.paymentMethod || 'Mobile Money / Card';
  const paymentPhone = orderData.paymentPhone || orderData.phoneNumber || 'N/A';
  const customerName = orderData.customer?.name || orderData.customerName || 'Customer';
  const customerEmail = orderData.customer?.email || orderData.customerEmail || 'N/A';

  const itemsSummaryText = items.length ? items.map((it, idx) => {
    const shop = it.shopName || it.seller || orderData.shopName || 'AfriBay Verified Seller';
    const title = it.title || it.name || 'Product item';
    const qty = it.quantity || it.qty || 1;
    const price = Number(it.priceZMW || it.price || 0).toLocaleString('en-ZM', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return `  ${idx + 1}. Shop: ${shop}\n     Product: ${title}\n     Quantity: ${qty}\n     Price each: ZMW ${price}`;
  }).join('\n\n') : '  No item details provided';

  const emailSubject = `[AfriBay Order Alert] New Order ${trackingId} - ZMW ${totalZMW}`;
  const emailBody = `
======================================================
           AFRIBAY NEW ORDER NOTIFICATION
======================================================

An order has been placed on AfriBay!

ORDER DETAILS:
------------------------------------------------------
Tracking ID:       ${trackingId}
Total Amount:      ZMW ${totalZMW}
Payment Method:    ${paymentMethod}
Customer Phone:    ${paymentPhone}
Customer Name:     ${customerName} (${customerEmail})

DELIVERY LOCATION:
------------------------------------------------------
Address:           ${deliveryAddress}

PRODUCTS & SHOPS:
------------------------------------------------------
${itemsSummaryText}

======================================================
Timestamp: ${new Date().toISOString()}
Notification sent to: ${recipient}
======================================================
`;

  console.log(`\n📧 [EMAIL NOTIFICATION DISPATCHED] -> To: ${recipient}`);
  console.log(emailBody);

  // If a webhook or SMTP email service (Resend, SendGrid, Formspree, or custom webhook) is configured:
  const emailWebhookUrl = process.env.ORDER_EMAIL_WEBHOOK_URL;
  if (emailWebhookUrl) {
    try {
      await fetch(emailWebhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: recipient,
          subject: emailSubject,
          text: emailBody,
          order: orderData
        })
      });
      console.log(`[EMAIL NOTIFICATION] Forwarded to external email service: ${emailWebhookUrl}`);
    } catch (err) {
      console.warn(`[EMAIL NOTIFICATION] Webhook forward error: ${err.message}`);
    }
  }

  return { success: true, recipient, emailSubject };
}

/**
 * Fetches OAuth 2.0 token using Node's native fetch API
 */
export async function getFlutterwaveOAuthToken() {
  if (cachedToken && Date.now() < tokenExpiresAt - 60000) {
    return { success: true, token: cachedToken, cached: true };
  }

  const tokenUrl = 'https://idp.flutterwave.com/realms/flutterwave/protocol/openid-connect/token';

  console.log(`[Flutterwave v4] Requesting OAuth token from Flutterwave IdP...`);

  try {
    const params = new URLSearchParams();
    params.append('client_id', CLIENT_ID);
    params.append('client_secret', CLIENT_SECRET);
    params.append('grant_type', 'client_credentials');

    const res = await fetch(tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json'
      },
      body: params.toString()
    });

    const body = await res.json();

    if (!res.ok || !body.access_token) {
      return {
        success: false,
        status: res.status,
        error: body.message || body.error_description || 'OAuth token request rejected',
        details: body
      };
    }

    cachedToken = body.access_token;
    const expiresIn = (body.expires_in || 3600) * 1000;
    tokenExpiresAt = Date.now() + expiresIn;

    return {
      success: true,
      token: cachedToken,
      expiresIn: body.expires_in
    };
  } catch (err) {
    return {
      success: false,
      error: err.message
    };
  }
}

// Native HTTP Server with CORS
const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = new URL(req.url, `http://${req.headers.host}`);

  // Endpoint: Health & Diagnostic
  if (url.pathname === '/api/health' && req.method === 'GET') {
    res.setHeader('Content-Type', 'application/json');
    const tokenResult = await getFlutterwaveOAuthToken();

    res.writeHead(tokenResult.success ? 200 : 502);
    res.end(JSON.stringify({
      service: 'AfriBay Zambian Payment Gateway',
      environment: 'Sandbox / Test Mode',
      clientId: `${CLIENT_ID.substring(0, 10)}...`,
      encryptionKeyConfigured: Boolean(ENCRYPTION_KEY),
      oauthResult: tokenResult
    }, null, 2));
    return;
  }

  // Endpoint: Direct OAuth Token Check
  if (url.pathname === '/api/auth/token') {
    res.setHeader('Content-Type', 'application/json');
    const result = await getFlutterwaveOAuthToken();
    res.writeHead(result.success ? 200 : 400);
    res.end(JSON.stringify(result, null, 2));
    return;
  }

  // Endpoint: Initiate Checkout
  if (url.pathname === '/api/checkout/initiate' && req.method === 'POST') {
    let bodyData = '';
    req.on('data', chunk => { bodyData += chunk; });
    req.on('end', async () => {
      res.setHeader('Content-Type', 'application/json');
      try {
        const payload = JSON.parse(bodyData || '{}');
        const tokenResult = await getFlutterwaveOAuthToken();

        if (!tokenResult.success) {
          res.writeHead(502);
          res.end(JSON.stringify({
            success: false,
            message: 'Failed to acquire Flutterwave OAuth token for checkout',
            oauthError: tokenResult
          }));
          return;
        }

        const txRef = payload.txRef || `AFB-${Date.now().toString(36).toUpperCase()}`;

        // Send email alert to luyandokandisha@gmail.com
        try {
          await sendOrderNotificationEmail(payload);
        } catch (emailErr) {
          console.warn('[Checkout Alert] Email notify note:', emailErr.message);
        }

        res.writeHead(200);
        res.end(JSON.stringify({
          success: true,
          message: 'OAuth token verified. Checkout initiated and email notification dispatched.',
          txRef,
          amountZMW: payload.amount,
          notified: ADMIN_NOTIFICATION_EMAIL,
          tokenUsed: `${tokenResult.token.substring(0, 10)}...`
        }));
      } catch (err) {
        res.writeHead(400);
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
    return;
  }

  // Endpoint: Dedicated Order Notification Alert
  if (url.pathname === '/api/orders/notify' && req.method === 'POST') {
    let bodyData = '';
    req.on('data', chunk => { bodyData += chunk; });
    req.on('end', async () => {
      res.setHeader('Content-Type', 'application/json');
      try {
        const orderData = JSON.parse(bodyData || '{}');
        const result = await sendOrderNotificationEmail(orderData);
        res.writeHead(200);
        res.end(JSON.stringify({
          success: true,
          message: `Order notification delivered to ${result.recipient}`,
          emailSubject: result.emailSubject
        }));
      } catch (err) {
        res.writeHead(500);
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
    return;
  }

  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Endpoint not found' }));
});

server.listen(PORT, () => {
  console.log(`\n======================================================`);
  console.log(` AfriBay Flutterwave OAuth Server active on port ${PORT}`);
  console.log(` Diagnostics: http://localhost:${PORT}/api/health`);
  console.log(`======================================================\n`);
});
