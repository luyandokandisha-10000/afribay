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

// In-memory Escrow Order Registry
const escrowOrders = new Map();

/**
 * Sends an email notification to luyandokandisha@gmail.com when an order is placed and held in Escrow.
 * Details shop name, products, total amount, delivery location, Escrow status, and Delivery Confirmation PIN.
 */
export async function sendOrderNotificationEmail(orderData) {
  const recipient = ADMIN_NOTIFICATION_EMAIL;
  const items = Array.isArray(orderData.items) ? orderData.items : [];
  const trackingId = orderData.trackingId || orderData.txRef || 'N/A';
  const deliveryAddress = orderData.deliveryAddress || orderData.deliveryLocation || 'Not specified';
  const totalZMW = Number(orderData.totalZMW || orderData.amount || 0).toLocaleString('en-ZM', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const paymentMethod = orderData.paymentMethod || 'Mobile Money / Card';
  const paymentPhone = orderData.paymentPhone || orderData.phoneNumber || 'N/A';
  const customerName = orderData.customer?.name || orderData.customerName || 'Customer';
  const customerEmail = orderData.customer?.email || orderData.customerEmail || 'N/A';
  const deliveryPin = orderData.deliveryPin || 'N/A';
  const escrowStatus = orderData.escrowStatus || 'Escrow Held / Processing';

  const itemsSummaryText = items.length ? items.map((it, idx) => {
    const shop = it.shopName || it.seller || orderData.shopName || 'AfriBay Verified Seller';
    const title = it.title || it.name || 'Product item';
    const qty = it.quantity || it.qty || 1;
    const price = Number(it.priceZMW || it.price || 0).toLocaleString('en-ZM', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return `  ${idx + 1}. Shop: ${shop}\n     Product: ${title}\n     Quantity: ${qty}\n     Price each: ZMW ${price}`;
  }).join('\n\n') : '  No item details provided';

  const emailSubject = `[AfriBay Escrow Alert] New Order ${trackingId} - ZMW ${totalZMW} (Escrow Held)`;
  const emailBody = `
======================================================
     AFRIBAY ESCROW ORDER NOTIFICATION (ZAMBIA)
======================================================

An order has been placed and funds are SECURED IN ESCROW!
Funds will remain locked until driver drop-off is verified with the PIN.

ESCROW & ORDER DETAILS:
------------------------------------------------------
Tracking ID:              ${trackingId}
Escrow Status:            🛡️ ${escrowStatus}
Delivery Confirmation PIN: 🔑 [ ${deliveryPin} ]
Total Amount Held:        ZMW ${totalZMW}
Vendor Payout Status:     ⏳ HELD IN ESCROW (Pending drop-off verification)
Payment Method:           ${paymentMethod}
Customer Phone:           ${paymentPhone}
Customer Name:            ${customerName} (${customerEmail})

DELIVERY DESTINATION:
------------------------------------------------------
Address:                  ${deliveryAddress}

PRODUCTS & SHOPS:
------------------------------------------------------
${itemsSummaryText}

======================================================
Timestamp: ${new Date().toISOString()}
Notification sent to: ${recipient}
======================================================
`;

  console.log(`\n📧 [ESCROW HELD EMAIL DISPATCHED] -> To: ${recipient}`);
  console.log(emailBody);

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
 * Sends an email notification to luyandokandisha@gmail.com when delivery drop-off is confirmed,
 * the PIN is verified, and escrow payout is released to the vendor.
 */
export async function sendEscrowReleaseNotificationEmail(orderData, releaseDetails = {}) {
  const recipient = ADMIN_NOTIFICATION_EMAIL;
  const trackingId = orderData.trackingId || orderData.txRef || 'N/A';
  const totalZMW = Number(orderData.totalZMW || orderData.amount || 0).toLocaleString('en-ZM', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const deliveryAddress = orderData.deliveryAddress || orderData.deliveryLocation || 'Not specified';
  const verifiedBy = releaseDetails.verifiedBy || 'Delivery Rider / Logistics System';
  const vendorPayoutZMW = Number(orderData.vendorPayoutZMW || Math.max(0, (orderData.totalZMW || orderData.amount || 0) - 35)).toLocaleString('en-ZM', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const items = Array.isArray(orderData.items) ? orderData.items : [];
  const primaryShop = items[0]?.shopName || orderData.shopName || 'AfriBay Vendor';

  const emailSubject = `[AfriBay Payout Released] Delivery Completed for Order ${trackingId} - ZMW ${vendorPayoutZMW} to ${primaryShop}`;
  const emailBody = `
======================================================
     AFRIBAY ESCROW PAYOUT RELEASED (ZAMBIA)
======================================================

The delivery for Order ${trackingId} has been successfully verified!
The platform escrow has unlocked and funds are now RELEASED to the vendor.

ESCROW RELEASE DETAILS:
------------------------------------------------------
Tracking ID:              ${trackingId}
Escrow Lifecycle:         ✅ COMPLETED & RELEASED
Verified By:              ${verifiedBy}
Verification PIN:         Valid Match Verified
Total Order Value:        ZMW ${totalZMW}
Vendor Payable Released:  💰 ZMW ${vendorPayoutZMW}
Recipient Shop:           ${primaryShop}
Delivered To:             ${deliveryAddress}

======================================================
Completion Timestamp: ${new Date().toISOString()}
Notification sent to: ${recipient}
======================================================
`;

  console.log(`\n🎉 [ESCROW RELEASED EMAIL DISPATCHED] -> To: ${recipient}`);
  console.log(emailBody);

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
          order: orderData,
          releaseDetails
        })
      });
    } catch (err) {
      console.warn(`[ESCROW RELEASE NOTIFICATION] Webhook note: ${err.message}`);
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
      service: 'AfriBay Zambian Escrow & Payment Gateway',
      environment: 'Sandbox / Test Mode',
      escrowActive: true,
      totalEscrowOrders: escrowOrders.size,
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

  // Endpoint: Initiate Checkout & Register Escrow
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

        const txRef = payload.txRef || payload.trackingId || `AFB-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
        const deliveryPin = payload.deliveryPin || String(Math.floor(100000 + Math.random() * 900000));
        const totalAmount = Number(payload.amount || payload.totalZMW || 0);
        const vendorPayoutAmount = Math.max(0, totalAmount - 35); // 35 ZMW logistics delivery fee

        const orderRecord = {
          ...payload,
          trackingId: txRef,
          txRef,
          totalZMW: totalAmount,
          vendorPayoutZMW: vendorPayoutAmount,
          deliveryPin,
          escrowStatus: 'escrow_held',
          deliveryStatus: 'processing',
          payoutStatus: 'held_in_escrow',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };

        escrowOrders.set(txRef, orderRecord);

        // Send email alert to luyandokandisha@gmail.com with Escrow details
        try {
          await sendOrderNotificationEmail(orderRecord);
        } catch (emailErr) {
          console.warn('[Checkout Alert] Email notify note:', emailErr.message);
        }

        res.writeHead(200);
        res.end(JSON.stringify({
          success: true,
          message: 'OAuth token verified. Checkout initiated and order placed in Escrow.',
          txRef,
          trackingId: txRef,
          deliveryPin,
          escrowStatus: 'escrow_held',
          payoutStatus: 'held_in_escrow',
          amountZMW: totalAmount,
          vendorPayoutZMW: vendorPayoutAmount,
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

  // Endpoint: Dedicated Order Notification & Escrow Registration
  if (url.pathname === '/api/orders/notify' && req.method === 'POST') {
    let bodyData = '';
    req.on('data', chunk => { bodyData += chunk; });
    req.on('end', async () => {
      res.setHeader('Content-Type', 'application/json');
      try {
        const orderData = JSON.parse(bodyData || '{}');
        const trackingId = orderData.trackingId || orderData.txRef || `AFB-${Date.now().toString(36).toUpperCase()}`;
        const deliveryPin = orderData.deliveryPin || String(Math.floor(100000 + Math.random() * 900000));
        const totalAmount = Number(orderData.totalZMW || orderData.amount || 0);

        const orderRecord = {
          ...orderData,
          trackingId,
          deliveryPin,
          escrowStatus: orderData.escrowStatus || 'escrow_held',
          deliveryStatus: orderData.deliveryStatus || 'processing',
          payoutStatus: orderData.payoutStatus || 'held_in_escrow',
          vendorPayoutZMW: orderData.vendorPayoutZMW || Math.max(0, totalAmount - 35),
          updatedAt: new Date().toISOString()
        };

        escrowOrders.set(trackingId, orderRecord);

        const result = await sendOrderNotificationEmail(orderRecord);
        res.writeHead(200);
        res.end(JSON.stringify({
          success: true,
          message: `Escrow order notification delivered to ${result.recipient}`,
          trackingId,
          deliveryPin,
          escrowStatus: orderRecord.escrowStatus,
          emailSubject: result.emailSubject
        }));
      } catch (err) {
        res.writeHead(500);
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
    return;
  }

  // Endpoint: Transition Order to Logistics Transit
  if (url.pathname === '/api/escrow/assign-transit' && req.method === 'POST') {
    let bodyData = '';
    req.on('data', chunk => { bodyData += chunk; });
    req.on('end', async () => {
      res.setHeader('Content-Type', 'application/json');
      try {
        const payload = JSON.parse(bodyData || '{}');
        const trackingId = payload.trackingId || payload.txRef;

        if (!trackingId) {
          res.writeHead(400);
          res.end(JSON.stringify({ success: false, message: 'trackingId is required' }));
          return;
        }

        let order = escrowOrders.get(trackingId) || payload.orderData || { trackingId };
        order.escrowStatus = 'in_transit';
        order.deliveryStatus = 'in_transit';
        order.riderAssigned = payload.riderName || payload.courier || 'AfriBay Logistics Fleet';
        order.riderPhone = payload.riderPhone || '+260 97 112233';
        order.dispatchedAt = new Date().toISOString();
        order.updatedAt = new Date().toISOString();

        escrowOrders.set(trackingId, order);

        console.log(`🚚 [LOGISTICS DISPATCH] Order ${trackingId} assigned to ${order.riderAssigned}. In Transit.`);

        res.writeHead(200);
        res.end(JSON.stringify({
          success: true,
          message: 'Order successfully dispatched and marked In Transit.',
          trackingId,
          escrowStatus: 'in_transit',
          deliveryStatus: 'in_transit',
          order
        }));
      } catch (err) {
        res.writeHead(500);
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
    return;
  }

  // Endpoint: Verify Delivery Drop-off PIN & Trigger Payout Release
  if (url.pathname === '/api/escrow/verify-delivery' && req.method === 'POST') {
    let bodyData = '';
    req.on('data', chunk => { bodyData += chunk; });
    req.on('end', async () => {
      res.setHeader('Content-Type', 'application/json');
      try {
        const payload = JSON.parse(bodyData || '{}');
        const trackingId = payload.trackingId || payload.txRef;
        const inputPin = String(payload.deliveryPin || payload.pin || '').trim();
        const verifiedBy = payload.verifiedBy || 'Delivery Rider';

        if (!trackingId || !inputPin) {
          res.writeHead(400);
          res.end(JSON.stringify({ success: false, message: 'trackingId and deliveryPin are required' }));
          return;
        }

        let order = escrowOrders.get(trackingId) || payload.orderData;

        if (!order) {
          res.writeHead(404);
          res.end(JSON.stringify({ success: false, message: 'Escrow order not found in registry' }));
          return;
        }

        const expectedPin = String(order.deliveryPin || '').trim();

        if (expectedPin && expectedPin !== inputPin) {
          console.warn(`⚠️ [ESCROW PIN MISMATCH] Order ${trackingId}: expected "${expectedPin}", received "${inputPin}"`);
          res.writeHead(400);
          res.end(JSON.stringify({
            success: false,
            message: 'Invalid delivery confirmation PIN. Escrow funds remain securely held.'
          }));
          return;
        }

        // PIN is valid: Complete Order & Release Escrow Funds to Vendor
        order.escrowStatus = 'completed';
        order.deliveryStatus = 'delivered';
        order.payoutStatus = 'released';
        order.completedAt = new Date().toISOString();
        order.releasedAt = new Date().toISOString();
        order.verifiedBy = verifiedBy;
        order.updatedAt = new Date().toISOString();

        escrowOrders.set(trackingId, order);

        // Send release notification email to luyandokandisha@gmail.com
        try {
          await sendEscrowReleaseNotificationEmail(order, { verifiedBy });
        } catch (emailErr) {
          console.warn('[Escrow Release Alert] Email notify note:', emailErr.message);
        }

        res.writeHead(200);
        res.end(JSON.stringify({
          success: true,
          message: 'Delivery PIN confirmed! Escrow funds released to vendor account.',
          trackingId,
          escrowStatus: 'completed',
          deliveryStatus: 'delivered',
          payoutStatus: 'released',
          vendorPayoutZMW: order.vendorPayoutZMW,
          order
        }));
      } catch (err) {
        res.writeHead(500);
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
    return;
  }

  // Endpoint: Query Escrow Orders Registry
  if (url.pathname === '/api/escrow/orders' && req.method === 'GET') {
    res.setHeader('Content-Type', 'application/json');
    const ordersList = Array.from(escrowOrders.values());
    res.writeHead(200);
    res.end(JSON.stringify({
      success: true,
      count: ordersList.length,
      orders: ordersList
    }));
    return;
  }

  // Endpoint: Query Single Order Status
  if (url.pathname === '/api/escrow/order' && req.method === 'GET') {
    res.setHeader('Content-Type', 'application/json');
    const trackingId = url.searchParams.get('trackingId');
    if (!trackingId || !escrowOrders.has(trackingId)) {
      res.writeHead(404);
      res.end(JSON.stringify({ success: false, message: 'Order not found in escrow registry' }));
      return;
    }
    res.writeHead(200);
    res.end(JSON.stringify({
      success: true,
      order: escrowOrders.get(trackingId)
    }));
    return;
  }

  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Endpoint not found' }));
});

server.listen(PORT, () => {
  console.log(`\n======================================================`);
  console.log(` AfriBay Zambian Mobile Money Escrow Server active on port ${PORT}`);
  console.log(` Diagnostics: http://localhost:${PORT}/api/health`);
  console.log(` Escrow Registry: http://localhost:${PORT}/api/escrow/orders`);
  console.log(`======================================================\n`);
});
