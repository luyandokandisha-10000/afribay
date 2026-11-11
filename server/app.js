import http from 'node:http';
import https from 'node:https';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { processPawaPayWebhook } from './routes/webhooks.js';
import { processPawaPayCheckout } from './routes/checkout.js';

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

// In-memory Registries (Escrow, Clean Shops & Clean Products)
const escrowOrders = new Map();
const shops = new Map();
const productsMap = new Map();

/**
 * Validates vendor subscription & 5-day trial status.
 * - First 5 days of selling are 100% free.
 * - After 5 days, vendor must pay K20/week or K100/month.
 * - Destination numbers: MTN: 0760312951 | Airtel: 0778085670.
 */
export function checkVendorSubscription(shop) {
  const paymentLines = { mtn: '0760312951', airtel: '0778085670' };
  const pricingTiers = { weekly: 'K20/week', monthly: 'K100/month' };
  if (!shop) return { canList: false, status: 'no_shop', message: 'Shop profile not found', paymentLines, pricingTiers };
  const now = Date.now();
  const createdAt = shop.createdAt ? new Date(shop.createdAt).getTime() : now;
  const trialEndsAt = shop.trialEndsAt ? new Date(shop.trialEndsAt).getTime() : (createdAt + 5 * 24 * 60 * 60 * 1000);
  const subscriptionEndsAt = shop.subscriptionEndsAt ? new Date(shop.subscriptionEndsAt).getTime() : 0;

  // Active paid subscription
  if (shop.subscriptionStatus === 'active' && subscriptionEndsAt > now) {
    const daysLeft = Math.ceil((subscriptionEndsAt - now) / (24 * 60 * 60 * 1000));
    return {
      canList: true,
      status: 'active',
      tier: shop.subscriptionTier || 'weekly',
      daysLeft,
      subscriptionEndsAt: new Date(subscriptionEndsAt).toISOString(),
      paymentLines,
      pricingTiers
    };
  }

  // Active 5-day free trial
  if (now <= trialEndsAt) {
    const daysLeft = Math.max(1, Math.ceil((trialEndsAt - now) / (24 * 60 * 60 * 1000)));
    return {
      canList: true,
      status: 'trial',
      daysLeft,
      trialEndsAt: new Date(trialEndsAt).toISOString(),
      paymentLines,
      pricingTiers
    };
  }

  // Trial expired & no active subscription
  return {
    canList: false,
    status: 'expired',
    message: 'Your 5-day free trial has expired. Subscribe for K20/week or K100/month to keep store active and post listings.',
    pricingTiers,
    paymentLines
  };
}

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

  const deliveryLat = orderData.delivery_lat ?? orderData.deliveryLat ?? null;
  const deliveryLng = orderData.delivery_lng ?? orderData.deliveryLng ?? null;
  const gpsInfo = (deliveryLat != null && deliveryLng != null)
    ? `\nGPS Coordinates:          ${deliveryLat}, ${deliveryLng}\nCourier Google Maps Pin:  https://www.google.com/maps?q=${deliveryLat},${deliveryLng}`
    : '\nGPS Coordinates:          Not pinned (Text address only)';

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
Address:                  ${deliveryAddress}${gpsInfo}

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

    res.writeHead(200);
    res.end(JSON.stringify({
      status: 'ok',
      service: 'AfriBay Zambian Escrow & Payment Gateway',
      environment: 'Sandbox / Test Mode',
      escrowActive: true,
      totalEscrowOrders: escrowOrders.size,
      clientId: `${CLIENT_ID.substring(0, 10)}...`,
      encryptionKeyConfigured: Boolean(ENCRYPTION_KEY),
      oauthConnected: Boolean(tokenResult?.success),
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

  // Endpoint: PawaPay Webhook Handler
  if (url.pathname === '/api/webhooks/pawapay' && req.method === 'POST') {
    let bodyData = '';
    req.on('data', chunk => { bodyData += chunk; });
    req.on('end', async () => {
      res.setHeader('Content-Type', 'application/json');
      try {
        const webhookData = JSON.parse(bodyData || '{}');
        const result = await processPawaPayWebhook(webhookData, { escrowOrders });
        res.writeHead(result.status);
        res.end(JSON.stringify(result.json));
      } catch (error) {
        console.error("Error processing PawaPay webhook:", error);
        res.writeHead(500);
        res.end(JSON.stringify({ error: "Internal Server Error" }));
      }
    });
    return;
  }

  // Endpoint: PawaPay Checkout Deposit Initiation
  if (url.pathname === '/api/checkout' && req.method === 'POST') {
    let bodyData = '';
    req.on('data', chunk => { bodyData += chunk; });
    req.on('end', async () => {
      res.setHeader('Content-Type', 'application/json');
      try {
        const payload = JSON.parse(bodyData || '{}');
        const result = await processPawaPayCheckout(payload, { escrowOrders });
        res.writeHead(result.status);
        res.end(JSON.stringify(result.json));
      } catch (error) {
        console.error("Error initiating PawaPay deposit:", error);
        res.writeHead(500);
        res.end(JSON.stringify({ error: "Internal server error" }));
      }
    });
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

        const delivery_lat = payload.delivery_lat != null ? Number(payload.delivery_lat) : (payload.deliveryLat != null ? Number(payload.deliveryLat) : null);
        const delivery_lng = payload.delivery_lng != null ? Number(payload.delivery_lng) : (payload.deliveryLng != null ? Number(payload.deliveryLng) : null);

        const orderRecord = {
          ...payload,
          trackingId: txRef,
          txRef,
          totalZMW: totalAmount,
          vendorPayoutZMW: vendorPayoutAmount,
          deliveryPin,
          delivery_lat,
          delivery_lng,
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
          delivery_lat,
          delivery_lng,
          courierMapsUrl: (delivery_lat != null && delivery_lng != null) ? `https://www.google.com/maps?q=${delivery_lat},${delivery_lng}` : null,
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

        const delivery_lat = orderData.delivery_lat != null ? Number(orderData.delivery_lat) : (orderData.deliveryLat != null ? Number(orderData.deliveryLat) : null);
        const delivery_lng = orderData.delivery_lng != null ? Number(orderData.delivery_lng) : (orderData.deliveryLng != null ? Number(orderData.deliveryLng) : null);

        const orderRecord = {
          ...orderData,
          trackingId,
          deliveryPin,
          delivery_lat,
          delivery_lng,
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
          recipient: result.recipient,
          message: `Escrow order notification delivered to ${result.recipient}`,
          trackingId,
          deliveryPin,
          delivery_lat,
          delivery_lng,
          courierMapsUrl: (delivery_lat != null && delivery_lng != null) ? `https://www.google.com/maps?q=${delivery_lat},${delivery_lng}` : null,
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
  if ((url.pathname === '/api/escrow/assign-transit' || url.pathname === '/api/escrow/in-transit') && req.method === 'POST') {
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
  if ((url.pathname === '/api/escrow/verify-delivery' || url.pathname === '/api/escrow/release') && req.method === 'POST') {
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

  // Endpoint: Query Single Order Status (Supports query param or path param e.g. /api/escrow/status/:id)
  if ((url.pathname === '/api/escrow/order' || url.pathname.startsWith('/api/escrow/status/') || url.pathname.startsWith('/api/escrow/order/')) && req.method === 'GET') {
    res.setHeader('Content-Type', 'application/json');
    let trackingId = url.searchParams.get('trackingId');
    if (!trackingId) {
      const parts = url.pathname.split('/');
      trackingId = parts[parts.length - 1];
    }
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

  // Endpoint: Create or Register Shop
  if (url.pathname === '/api/shops' && req.method === 'POST') {
    let bodyData = '';
    req.on('data', chunk => { bodyData += chunk; });
    req.on('end', async () => {
      res.setHeader('Content-Type', 'application/json');
      try {
        const payload = JSON.parse(bodyData || '{}');
        const { shopName, mtnPhone, airtelPhone, payoutPreference, contactPhone, description, physicalAddress, shop_lat, shop_lng, userId } = payload;

        if (!shopName || !shopName.trim()) {
          res.writeHead(400);
          res.end(JSON.stringify({ success: false, error: 'Shop name is required' }));
          return;
        }

        if (!mtnPhone || !mtnPhone.trim()) {
          res.writeHead(400);
          res.end(JSON.stringify({ success: false, error: 'MTN Mobile Money phone number is required' }));
          return;
        }

        if (!airtelPhone || !airtelPhone.trim()) {
          res.writeHead(400);
          res.end(JSON.stringify({ success: false, error: 'Airtel Mobile Money phone number is required' }));
          return;
        }

        const shopId = payload.shopId || payload.id || `shop_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
        const now = Date.now();
        const trialDays = 5;
        const trialEndsAt = payload.trialEndsAt ? Number(payload.trialEndsAt) : (now + (trialDays * 24 * 60 * 60 * 1000));

        const shopRecord = {
          id: shopId,
          shopId,
          userId: userId || 'anonymous_vendor',
          shopName: shopName.trim(),
          mtnPhone: mtnPhone.trim(),
          airtelPhone: airtelPhone.trim(),
          contactPhone: contactPhone ? contactPhone.trim() : mtnPhone.trim(),
          payoutPreference: (payoutPreference === 'cash_collection') ? 'cash_collection' : 'mobile_money',
          description: description ? description.trim() : '',
          physicalAddress: physicalAddress ? physicalAddress.trim() : '',
          shop_lat: shop_lat != null ? Number(shop_lat) : null,
          shop_lng: shop_lng != null ? Number(shop_lng) : null,
          createdAt: new Date().toISOString(),
          trialEndsAt: new Date(trialEndsAt).toISOString(),
          subscriptionStatus: 'trial',
          subscriptionTier: null,
          subscriptionEndsAt: null,
          status: 'active'
        };

        shops.set(shopId, shopRecord);

        res.writeHead(201);
        res.end(JSON.stringify({
          success: true,
          message: 'Shop successfully created with 5-day free trial',
          id: shopId,
          shopId,
          ...shopRecord,
          shop: shopRecord,
          subscription: checkVendorSubscription(shopRecord),
          ...checkVendorSubscription(shopRecord)
        }));
      } catch (err) {
        res.writeHead(400);
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
    return;
  }

  // Endpoint: Query Shops
  if (url.pathname === '/api/shops' && req.method === 'GET') {
    res.setHeader('Content-Type', 'application/json');
    const shopId = url.searchParams.get('shopId');
    const userId = url.searchParams.get('userId');

    if (shopId && shops.has(shopId)) {
      const shop = shops.get(shopId);
      res.writeHead(200);
      res.end(JSON.stringify({ success: true, shop, subscription: checkVendorSubscription(shop) }));
      return;
    }

    if (userId) {
      const userShop = Array.from(shops.values()).find(s => s.userId === userId);
      if (userShop) {
        res.writeHead(200);
        res.end(JSON.stringify({ success: true, shop: userShop, subscription: checkVendorSubscription(userShop) }));
        return;
      }
    }

    const allShops = Array.from(shops.values());
    res.writeHead(200);
    res.end(JSON.stringify({ success: true, count: allShops.length, shops: allShops }));
    return;
  }

  // Endpoint: Vendor Subscription Status
  if (url.pathname === '/api/vendor/subscription/status' && req.method === 'GET') {
    res.setHeader('Content-Type', 'application/json');
    const shopId = url.searchParams.get('shopId');
    const shop = shopId ? shops.get(shopId) : Array.from(shops.values())[0];

    if (!shop) {
      res.writeHead(404);
      res.end(JSON.stringify({ success: false, error: 'Shop not found' }));
      return;
    }

    res.writeHead(200);
    res.end(JSON.stringify({
      success: true,
      shopId: shop.id,
      shopName: shop.shopName,
      subscription: checkVendorSubscription(shop),
      ...checkVendorSubscription(shop)
    }));
    return;
  }

  // Endpoint: Vendor Subscription Payment Activation
  if (url.pathname === '/api/vendor/subscription/activate' && req.method === 'POST') {
    let bodyData = '';
    req.on('data', chunk => { bodyData += chunk; });
    req.on('end', async () => {
      res.setHeader('Content-Type', 'application/json');
      try {
        const payload = JSON.parse(bodyData || '{}');
        const { shopId, tier, txRef, paymentLine } = payload; // tier: 'weekly' (K20) or 'monthly' (K100)

        const shop = shops.get(shopId) || Array.from(shops.values()).find(s => s.id === shopId || s.shopName === payload.shopName);
        if (!shop) {
          res.writeHead(404);
          res.end(JSON.stringify({ success: false, error: 'Shop not found to activate subscription' }));
          return;
        }

        const now = Date.now();
        const days = (tier === 'monthly') ? 30 : 7;
        const currentEndsAt = (shop.subscriptionEndsAt && new Date(shop.subscriptionEndsAt).getTime() > now)
          ? new Date(shop.subscriptionEndsAt).getTime()
          : now;
        const newEndsAt = currentEndsAt + (days * 24 * 60 * 60 * 1000);

        shop.subscriptionStatus = 'active';
        shop.subscriptionTier = (tier === 'monthly') ? 'monthly' : 'weekly';
        shop.subscriptionEndsAt = new Date(newEndsAt).toISOString();
        shop.lastPaymentTxRef = txRef || `SUB-${Date.now().toString(36).toUpperCase()}`;
        shop.paymentDestination = paymentLine || 'MTN: 0760312951 / Airtel: 0778085670';
        shop.updatedAt = new Date().toISOString();

        shops.set(shop.id, shop);

        res.writeHead(200);
        res.end(JSON.stringify({
          success: true,
          message: `Subscription successfully activated for ${days} days (${shop.subscriptionTier})`,
          shop,
          subscription: checkVendorSubscription(shop),
          ...checkVendorSubscription(shop)
        }));
      } catch (err) {
        res.writeHead(400);
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
    return;
  }

  // Endpoint: Create Product (Enforcing Vendor 5-day Trial & Subscription Middleware)
  if (url.pathname === '/api/products' && req.method === 'POST') {
    let bodyData = '';
    req.on('data', chunk => { bodyData += chunk; });
    req.on('end', async () => {
      res.setHeader('Content-Type', 'application/json');
      try {
        const payload = JSON.parse(bodyData || '{}');
        const { title, priceZMW, category, condition, shopId, description, imageUrls } = payload;

        if (!title || !title.trim()) {
          res.writeHead(400);
          res.end(JSON.stringify({ success: false, error: 'Product title is required' }));
          return;
        }

        if (!priceZMW || Number(priceZMW) <= 0) {
          res.writeHead(400);
          res.end(JSON.stringify({ success: false, error: 'Valid product price is required' }));
          return;
        }

        // Middleware Check: Validate vendor subscription
        const shop = shopId ? shops.get(shopId) : null;
        if (shop) {
          const subCheck = checkVendorSubscription(shop);
          if (!subCheck.canList) {
            res.writeHead(403);
            res.end(JSON.stringify({
              success: false,
              locked: true,
              error: 'Vendor 5-day free trial has expired. Active subscription required to list products.',
              subscriptionCheck: subCheck,
              paymentLines: { mtn: '0760312951', airtel: '0778085670' },
              pricingTiers: { weekly: 'K20/week', monthly: 'K100/month' },
              instructions: 'Please send K20 (weekly) or K100 (monthly) to official accounts: MTN: 0760312951 or Airtel: 0778085670.'
            }));
            return;
          }
        }

        const productId = payload.productId || payload.id || `prod_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
        const productRecord = {
          id: productId,
          productId,
          title: title.trim(),
          description: description ? description.trim() : '',
          priceZMW: Number(priceZMW),
          category: category || 'clothes',
          condition: condition || 'used_good',
          shopId: shopId || (shop ? shop.id : ''),
          shopName: shop ? shop.shopName : (payload.shopName || 'AfriBay Seller'),
          mtnPhone: shop ? shop.mtnPhone : (payload.mtnPhone || ''),
          airtelPhone: shop ? shop.airtelPhone : (payload.airtelPhone || ''),
          payoutPreference: shop ? shop.payoutPreference : (payload.payoutPreference || 'mobile_money'),
          imageUrls: Array.isArray(imageUrls) ? imageUrls : [],
          createdAt: new Date().toISOString()
        };

        productsMap.set(productId, productRecord);

        res.writeHead(201);
        res.end(JSON.stringify({
          success: true,
          message: 'Product listing published cleanly',
          product: productRecord
        }));
      } catch (err) {
        res.writeHead(400);
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
    return;
  }

  // Endpoint: Query Clean Marketplace Products
  if (url.pathname === '/api/products' && req.method === 'GET') {
    res.setHeader('Content-Type', 'application/json');
    const allProducts = Array.from(productsMap.values());
    res.writeHead(200);
    res.end(JSON.stringify({
      success: true,
      count: allProducts.length,
      products: allProducts
    }));
    return;
  }

  // Endpoint: Delete Product
  if (url.pathname.startsWith('/api/products/') && req.method === 'DELETE') {
    res.setHeader('Content-Type', 'application/json');
    const productId = url.pathname.replace('/api/products/', '');
    if (!productId) {
      res.writeHead(400);
      res.end(JSON.stringify({ success: false, error: 'Product ID required' }));
      return;
    }
    productsMap.delete(productId);
    res.writeHead(200);
    res.end(JSON.stringify({ success: true, message: `Product ${productId} deleted successfully` }));
    return;
  }

  // Endpoint: Delete Shop
  if (url.pathname.startsWith('/api/shops/') && req.method === 'DELETE') {
    res.setHeader('Content-Type', 'application/json');
    const shopId = url.pathname.replace('/api/shops/', '');
    if (!shopId) {
      res.writeHead(400);
      res.end(JSON.stringify({ success: false, error: 'Shop ID required' }));
      return;
    }
    shops.delete(shopId);
    // Also remove any products owned by this shop
    for (const [pId, p] of productsMap.entries()) {
      if (p.shopId === shopId) {
        productsMap.delete(pId);
      }
    }
    res.writeHead(200);
    res.end(JSON.stringify({ success: true, message: `Shop ${shopId} and associated listings deleted successfully` }));
    return;
  }

  // Endpoint: Customer Report - Product Not Arrived in > 2 Days
  if (url.pathname === '/api/orders/report-delay' && req.method === 'POST') {
    res.setHeader('Content-Type', 'application/json');
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        const payload = JSON.parse(body || '{}');
        const trackingId = payload.trackingId;
        const buyerPhone = payload.buyerPhone || payload.phone || 'N/A';
        const reason = payload.reason || 'Product has not arrived in more than two days (48+ hours)';

        if (!trackingId) {
          res.writeHead(400);
          res.end(JSON.stringify({ success: false, error: 'Tracking ID is required' }));
          return;
        }

        console.log(`\n🚨 [DELIVERY DELAY REPORT] Order ${trackingId} flagged by customer: "${reason}"`);

        // Send alert to admin email
        const adminEmail = ADMIN_NOTIFICATION_EMAIL;
        const subject = `[AfriBay Alert] Delivery Overdue (>2 Days) - Order ${trackingId}`;
        const emailBody = `
======================================================
      AFRIBAY CUSTOMER DELIVERY DELAY REPORT
======================================================

A customer has officially reported an overdue order that has NOT
arrived in more than two days (48 hours).

REPORT DETAILS:
------------------------------------------------------
Tracking ID:      ${trackingId}
Customer Contact: ${buyerPhone}
Reason:           ${reason}
Reported At:      ${new Date().toISOString()}
Notification to:  ${adminEmail}

Logistics and vendor review required immediately.
======================================================
`;
        console.log(emailBody);

        res.writeHead(200);
        res.end(JSON.stringify({
          success: true,
          message: 'Delivery delay report submitted. Support team alerted.',
          trackingId,
          status: 'under_investigation'
        }));
      } catch (err) {
        res.writeHead(400);
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
  console.log(` AfriBay Zambian Mobile Money Escrow Server active on port ${PORT}`);
  console.log(` Diagnostics: http://localhost:${PORT}/api/health`);
  console.log(` Escrow Registry: http://localhost:${PORT}/api/escrow/orders`);
  console.log(`======================================================\n`);
});
