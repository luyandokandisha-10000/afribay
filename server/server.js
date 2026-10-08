import express from 'express';
import cors from 'cors';
import 'dotenv/config';
import { getFlutterwaveOAuthToken, flutterwaveRequest } from './flutterwave.js';
import { sendOrderNotificationEmail, sendEscrowReleaseNotificationEmail } from './app.js';

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors({ origin: '*' }));
app.use(express.json());

// In-memory Escrow Order Registry
const escrowOrders = new Map();

// Health check & OAuth Token Verification route
app.get('/api/health', async (req, res) => {
  try {
    const token = await getFlutterwaveOAuthToken();
    res.json({
      status: 'ok',
      service: 'AfriBay Zambian Escrow & Payment Gateway',
      flutterwaveAuth: 'Connected',
      escrowActive: true,
      totalEscrowOrders: escrowOrders.size,
      tokenPreview: `${token.substring(0, 10)}...`
    });
  } catch (err) {
    res.status(500).json({
      status: 'degraded',
      service: 'AfriBay Checkout Gateway',
      flutterwaveAuth: 'Failed',
      error: err.message
    });
  }
});

/**
 * Direct OAuth Token Diagnostic Route
 */
app.post('/api/auth/token', async (req, res) => {
  try {
    const token = await getFlutterwaveOAuthToken();
    res.json({ success: true, message: 'OAuth token fetched successfully', token });
  } catch (error) {
    res.status(401).json({ success: false, message: error.message });
  }
});

/**
 * Initiate Checkout Route with Escrow Lock
 */
app.post('/api/checkout/initiate', async (req, res) => {
  try {
    const {
      amount,
      currency = 'ZMW',
      customer,
      paymentMethod = 'mobile_money',
      network = 'mtn',
      phoneNumber,
      txRef,
      redirectUrl,
      items,
      deliveryAddress,
      deliveryPin: inputPin
    } = req.body;

    if (!amount || amount <= 0) {
      return res.status(400).json({ error: 'Valid amount in ZMW is required' });
    }

    const reference = txRef || `AFB-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
    const deliveryPin = inputPin || String(Math.floor(100000 + Math.random() * 900000));
    const vendorPayoutZMW = Math.max(0, Number(amount) - 35);

    const orderRecord = {
      trackingId: reference,
      txRef: reference,
      totalZMW: Number(amount),
      vendorPayoutZMW,
      deliveryPin,
      escrowStatus: 'escrow_held',
      deliveryStatus: 'processing',
      payoutStatus: 'held_in_escrow',
      paymentMethod,
      phoneNumber,
      customer,
      items: items || [],
      deliveryAddress: deliveryAddress || 'Lusaka, Zambia',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    escrowOrders.set(reference, orderRecord);

    try {
      await sendOrderNotificationEmail(orderRecord);
    } catch (e) {
      console.warn('[Checkout Alert] Email notify note:', e.message);
    }

    res.json({
      success: true,
      reference,
      trackingId: reference,
      deliveryPin,
      escrowStatus: 'escrow_held',
      payoutStatus: 'held_in_escrow',
      amountZMW: Number(amount),
      vendorPayoutZMW
    });
  } catch (error) {
    console.error('[Checkout Error]:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Payment initiation failed'
    });
  }
});

/**
 * Order Notification & Registration Route
 */
app.post('/api/orders/notify', async (req, res) => {
  try {
    const orderData = req.body || {};
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

    res.json({
      success: true,
      message: `Escrow order notification delivered to ${result.recipient}`,
      trackingId,
      deliveryPin,
      escrowStatus: orderRecord.escrowStatus
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * Assign Order to Transit / Logistics
 */
app.post('/api/escrow/assign-transit', (req, res) => {
  try {
    const { trackingId, riderName, riderPhone } = req.body;
    if (!trackingId) return res.status(400).json({ error: 'trackingId is required' });

    let order = escrowOrders.get(trackingId) || req.body.orderData || { trackingId };
    order.escrowStatus = 'in_transit';
    order.deliveryStatus = 'in_transit';
    order.riderAssigned = riderName || 'AfriBay Logistics Fleet';
    order.riderPhone = riderPhone || '+260 97 112233';
    order.dispatchedAt = new Date().toISOString();
    order.updatedAt = new Date().toISOString();

    escrowOrders.set(trackingId, order);
    res.json({ success: true, trackingId, escrowStatus: 'in_transit', order });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * Verify Delivery PIN & Release Escrow to Vendor
 */
app.post('/api/escrow/verify-delivery', async (req, res) => {
  try {
    const { trackingId, deliveryPin, verifiedBy = 'Delivery Rider', orderData } = req.body;
    if (!trackingId || !deliveryPin) {
      return res.status(400).json({ error: 'trackingId and deliveryPin are required' });
    }

    let order = escrowOrders.get(trackingId) || orderData;
    if (!order) {
      return res.status(404).json({ error: 'Escrow order not found' });
    }

    const expected = String(order.deliveryPin || '').trim();
    if (expected && expected !== String(deliveryPin).trim()) {
      return res.status(400).json({
        success: false,
        message: 'Invalid delivery confirmation PIN. Escrow funds remain securely held.'
      });
    }

    order.escrowStatus = 'completed';
    order.deliveryStatus = 'delivered';
    order.payoutStatus = 'released';
    order.completedAt = new Date().toISOString();
    order.releasedAt = new Date().toISOString();
    order.verifiedBy = verifiedBy;
    order.updatedAt = new Date().toISOString();

    escrowOrders.set(trackingId, order);

    try {
      await sendEscrowReleaseNotificationEmail(order, { verifiedBy });
    } catch (e) {
      console.warn('[Escrow Release Alert] Email error:', e.message);
    }

    res.json({
      success: true,
      message: 'Delivery PIN confirmed! Escrow funds released to vendor account.',
      trackingId,
      escrowStatus: 'completed',
      deliveryStatus: 'delivered',
      payoutStatus: 'released',
      vendorPayoutZMW: order.vendorPayoutZMW,
      order
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * Escrow Registry Query Routes
 */
app.get('/api/escrow/orders', (req, res) => {
  res.json({
    success: true,
    count: escrowOrders.size,
    orders: Array.from(escrowOrders.values())
  });
});

app.listen(PORT, () => {
  console.log(`\n🚀 AfriBay Flutterwave & Escrow Gateway running at http://localhost:${PORT}`);
  console.log(`   Health & OAuth status: http://localhost:${PORT}/api/health\n`);
});
