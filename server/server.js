import express from 'express';
import cors from 'cors';
import 'dotenv/config';
import { getFlutterwaveOAuthToken, flutterwaveRequest } from './flutterwave.js';
import { sendOrderNotificationEmail, sendEscrowReleaseNotificationEmail, checkVendorSubscription } from './app.js';
import { router as webhookRouter, processPawaPayWebhook } from './routes/webhooks.js';
import { router as checkoutRouter, processPawaPayCheckout } from './routes/checkout.js';

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors({ origin: '*' }));
app.use(express.json());

// In-memory Registries
const escrowOrders = new Map();
const shops = new Map();
const productsMap = new Map();

// PawaPay Checkout Deposit Initiation Handler
if (checkoutRouter) {
  app.use('/api', checkoutRouter);
} else {
  app.post('/api/checkout', async (req, res) => {
    try {
      const result = await processPawaPayCheckout(req.body, { escrowOrders });
      return res.status(result.status).json(result.json);
    } catch (error) {
      console.error("Error initiating PawaPay checkout:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });
}

// PawaPay Webhook Handler
if (webhookRouter) {
  app.use('/api/webhooks', webhookRouter);
} else {
  app.post('/api/webhooks/pawapay', async (req, res) => {
    try {
      const result = await processPawaPayWebhook(req.body, { escrowOrders });
      return res.status(result.status).json(result.json);
    } catch (error) {
      console.error("Error processing PawaPay webhook:", error);
      return res.status(500).json({ error: "Internal Server Error" });
    }
  });
}

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
    const delivery_lat = req.body.delivery_lat != null ? Number(req.body.delivery_lat) : (req.body.deliveryLat != null ? Number(req.body.deliveryLat) : null);
    const delivery_lng = req.body.delivery_lng != null ? Number(req.body.delivery_lng) : (req.body.deliveryLng != null ? Number(req.body.deliveryLng) : null);

    const orderRecord = {
      trackingId: reference,
      txRef: reference,
      totalZMW: Number(amount),
      vendorPayoutZMW,
      deliveryPin,
      delivery_lat,
      delivery_lng,
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
      delivery_lat,
      delivery_lng,
      courierMapsUrl: (delivery_lat != null && delivery_lng != null) ? `https://www.google.com/maps?q=${delivery_lat},${delivery_lng}` : null,
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

    res.json({
      success: true,
      recipient: result.recipient,
      message: `Escrow order notification delivered to ${result.recipient}`,
      trackingId,
      deliveryPin,
      delivery_lat,
      delivery_lng,
      courierMapsUrl: (delivery_lat != null && delivery_lng != null) ? `https://www.google.com/maps?q=${delivery_lat},${delivery_lng}` : null,
      escrowStatus: orderRecord.escrowStatus
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * Assign Order to Transit / Logistics
 */
app.post(['/api/escrow/assign-transit', '/api/escrow/in-transit'], (req, res) => {
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
app.post(['/api/escrow/verify-delivery', '/api/escrow/release'], async (req, res) => {
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

app.get(['/api/escrow/order', '/api/escrow/order/:trackingId', '/api/escrow/status/:trackingId'], (req, res) => {
  const trackingId = req.params.trackingId || req.query.trackingId;
  if (!trackingId || !escrowOrders.has(trackingId)) {
    return res.status(404).json({ success: false, message: 'Order not found in escrow registry' });
  }
  res.json({
    success: true,
    order: escrowOrders.get(trackingId)
  });
});

/**
 * Shop Management Endpoints
 */
app.post('/api/shops', (req, res) => {
  try {
    const { shopName, mtnPhone, airtelPhone, payoutPreference, contactPhone, description, physicalAddress, shop_lat, shop_lng, userId } = req.body;

    if (!shopName || !shopName.trim()) {
      return res.status(400).json({ success: false, error: 'Shop name is required' });
    }
    if (!mtnPhone || !mtnPhone.trim()) {
      return res.status(400).json({ success: false, error: 'MTN Mobile Money phone number is required' });
    }
    if (!airtelPhone || !airtelPhone.trim()) {
      return res.status(400).json({ success: false, error: 'Airtel Mobile Money phone number is required' });
    }

    const shopId = req.body.shopId || req.body.id || `shop_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const now = Date.now();
    const trialEndsAt = req.body.trialEndsAt ? Number(req.body.trialEndsAt) : (now + (5 * 24 * 60 * 60 * 1000));

    const shopRecord = {
      id: shopId,
      shopId,
      userId: userId || 'anonymous_vendor',
      shopName: shopName.trim(),
      mtnPhone: mtnPhone.trim(),
      airtelPhone: airtelPhone.trim(),
      contactPhone: contactPhone ? contactPhone.trim() : mtnPhone.trim(),
      payoutPreference: payoutPreference === 'cash_collection' ? 'cash_collection' : 'mobile_money',
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

    return res.status(201).json({
      success: true,
      message: 'Shop successfully created with 5-day free trial',
      id: shopId,
      shopId,
      ...shopRecord,
      shop: shopRecord,
      subscription: checkVendorSubscription(shopRecord),
      ...checkVendorSubscription(shopRecord)
    });
  } catch (err) {
    return res.status(400).json({ success: false, error: err.message });
  }
});

app.get('/api/shops', (req, res) => {
  const { shopId, userId } = req.query;
  if (shopId && shops.has(shopId)) {
    const shop = shops.get(shopId);
    return res.json({ success: true, shop, subscription: checkVendorSubscription(shop) });
  }
  if (userId) {
    const userShop = Array.from(shops.values()).find(s => s.userId === userId);
    if (userShop) {
      return res.json({ success: true, shop: userShop, subscription: checkVendorSubscription(userShop) });
    }
  }
  const all = Array.from(shops.values());
  return res.json({ success: true, count: all.length, shops: all });
});

/**
 * Vendor Subscription Status & Activation Endpoints
 */
app.get('/api/vendor/subscription/status', (req, res) => {
  const { shopId } = req.query;
  const shop = shopId ? shops.get(shopId) : Array.from(shops.values())[0];
  if (!shop) {
    return res.status(404).json({ success: false, error: 'Shop not found' });
  }
  return res.json({
    success: true,
    shopId: shop.id,
    shopName: shop.shopName,
    subscription: checkVendorSubscription(shop),
    ...checkVendorSubscription(shop)
  });
});

app.post('/api/vendor/subscription/activate', (req, res) => {
  try {
    const { shopId, tier, txRef, paymentLine } = req.body;
    const shop = shops.get(shopId) || Array.from(shops.values()).find(s => s.id === shopId || s.shopName === req.body.shopName);
    if (!shop) {
      return res.status(404).json({ success: false, error: 'Shop not found to activate subscription' });
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

    return res.json({
      success: true,
      message: `Subscription successfully activated for ${days} days (${shop.subscriptionTier})`,
      shop,
      subscription: checkVendorSubscription(shop),
      ...checkVendorSubscription(shop)
    });
  } catch (err) {
    return res.status(400).json({ success: false, error: err.message });
  }
});

/**
 * Product Listings Endpoints (With Subscription Check Middleware)
 */
app.post('/api/products', (req, res) => {
  try {
    const { title, priceZMW, category, condition, shopId, description, imageUrls } = req.body;

    if (!title || !title.trim()) {
      return res.status(400).json({ success: false, error: 'Product title is required' });
    }
    if (!priceZMW || Number(priceZMW) <= 0) {
      return res.status(400).json({ success: false, error: 'Valid product price is required' });
    }

    // Middleware: Check vendor subscription
    const shop = shopId ? shops.get(shopId) : null;
    if (shop) {
      const subCheck = checkVendorSubscription(shop);
      if (!subCheck.canList) {
        return res.status(403).json({
          success: false,
          locked: true,
          error: 'Vendor 5-day free trial has expired. Active subscription required to list products.',
          subscriptionCheck: subCheck,
          paymentLines: { mtn: '0760312951', airtel: '0778085670' },
          pricingTiers: { weekly: 'K20/week', monthly: 'K100/month' },
          instructions: 'Please send K20 (weekly) or K100 (monthly) to official accounts: MTN: 0760312951 or Airtel: 0778085670.'
        });
      }
    }

    const productId = req.body.productId || req.body.id || `prod_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const productRecord = {
      id: productId,
      productId,
      title: title.trim(),
      description: description ? description.trim() : '',
      priceZMW: Number(priceZMW),
      category: category || 'clothes',
      condition: condition || 'used_good',
      shopId: shopId || (shop ? shop.id : ''),
      shopName: shop ? shop.shopName : (req.body.shopName || 'AfriBay Seller'),
      mtnPhone: shop ? shop.mtnPhone : (req.body.mtnPhone || ''),
      airtelPhone: shop ? shop.airtelPhone : (req.body.airtelPhone || ''),
      payoutPreference: shop ? shop.payoutPreference : (req.body.payoutPreference || 'mobile_money'),
      imageUrls: Array.isArray(imageUrls) ? imageUrls : [],
      createdAt: new Date().toISOString()
    };

    productsMap.set(productId, productRecord);

    return res.status(201).json({
      success: true,
      message: 'Product listing published cleanly',
      product: productRecord
    });
  } catch (err) {
    return res.status(400).json({ success: false, error: err.message });
  }
});

app.get('/api/products', (req, res) => {
  const allProducts = Array.from(productsMap.values());
  return res.json({
    success: true,
    count: allProducts.length,
    products: allProducts
  });
});

app.delete('/api/products/:id', (req, res) => {
  const productId = req.params.id;
  if (!productId) {
    return res.status(400).json({ success: false, error: 'Product ID required' });
  }
  productsMap.delete(productId);
  return res.json({ success: true, message: `Product ${productId} deleted successfully` });
});

app.delete('/api/shops/:id', (req, res) => {
  const shopId = req.params.id;
  if (!shopId) {
    return res.status(400).json({ success: false, error: 'Shop ID required' });
  }
  shops.delete(shopId);
  for (const [pId, p] of productsMap.entries()) {
    if (p.shopId === shopId) {
      productsMap.delete(pId);
    }
  }
  return res.json({ success: true, message: `Shop ${shopId} and associated listings deleted successfully` });
});

app.post('/api/orders/report-delay', (req, res) => {
  try {
    const { trackingId, buyerPhone, phone, reason } = req.body || {};
    if (!trackingId) {
      return res.status(400).json({ success: false, error: 'Tracking ID is required' });
    }
    const reportReason = reason || 'Product has not arrived in more than two days (48+ hours)';
    console.log(`\n🚨 [DELIVERY DELAY REPORT] Order ${trackingId} flagged by customer: "${reportReason}"`);
    return res.json({
      success: true,
      message: 'Delivery delay report submitted. Support team alerted.',
      trackingId,
      status: 'under_investigation'
    });
  } catch (err) {
    return res.status(400).json({ success: false, error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`\n🚀 AfriBay Flutterwave & Escrow Gateway running at http://localhost:${PORT}`);
  console.log(`   Health & OAuth status: http://localhost:${PORT}/api/health\n`);
});
