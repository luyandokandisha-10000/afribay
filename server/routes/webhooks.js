import Order from '../models/Order.js';

let expressModule = null;
let router = null;

try {
  expressModule = await import('express');
  if (expressModule && typeof expressModule.default === 'function') {
    router = expressModule.default.Router();
  } else if (expressModule && typeof expressModule.Router === 'function') {
    router = expressModule.Router();
  }
} catch (_) {
  // Express not installed in environment, router will be null but processPawaPayWebhook remains fully functional
}

/**
 * Core PawaPay webhook processor logic.
 * Usable both in Express router and in native HTTP server environments.
 */
export async function processPawaPayWebhook(webhookData, options = {}) {
  // 1. Log incoming payload for debugging
  console.log("PawaPay Webhook Received:", JSON.stringify(webhookData, null, 2));

  // PawaPay webhook structure typically contains: depositId, status, amount, currency, reference, etc.
  const { depositId, status, reference } = webhookData || {};

  if (!depositId || !status) {
    return {
      status: 400,
      json: { error: "Invalid webhook payload missing depositId or status" }
    };
  }

  // 2. Map PawaPay status to your application order status
  let newOrderStatus;
  let paymentStatus;
  let escrowStatus;

  switch (status) {
    case 'COMPLETED':
      newOrderStatus = 'Processing'; // Ready for vendor to pack
      paymentStatus = 'Paid';
      escrowStatus = 'escrow_held';
      break;
    case 'FAILED':
    case 'REJECTED':
    case 'CANCELLED':
      newOrderStatus = 'Payment_Failed';
      paymentStatus = 'Failed';
      escrowStatus = 'failed';
      break;
    default:
      newOrderStatus = 'Pending_Payment';
      paymentStatus = 'Pending';
      escrowStatus = 'pending';
  }

  // 3. Update the order in your database using the reference or transaction ID
  // Note: 'reference' corresponds to the orderId or transaction reference you passed during checkout creation
  let updatedOrder = null;

  // Check shared in-memory registry if passed
  if (options.escrowOrders && options.escrowOrders.has(reference)) {
    const existing = options.escrowOrders.get(reference);
    existing.status = newOrderStatus;
    existing.paymentStatus = paymentStatus;
    existing.escrowStatus = escrowStatus;
    existing.pawaPayDepositId = depositId;
    existing.updatedAt = new Date().toISOString();
    options.escrowOrders.set(reference, existing);
    updatedOrder = existing;
  }

  // Also update Order model (MongoDB / Mongoose / Store)
  if (Order && typeof Order.findOneAndUpdate === 'function') {
    try {
      const modelOrder = await Order.findOneAndUpdate(
        { orderId: reference }, // or { _id: reference } depending on your ID structure
        { 
          status: newOrderStatus,
          paymentStatus: paymentStatus,
          escrowStatus: escrowStatus,
          pawaPayDepositId: depositId,
          updatedAt: Date.now()
        },
        { new: true }
      );
      if (modelOrder) updatedOrder = modelOrder;
    } catch (dbErr) {
      console.warn("Order model update error:", dbErr.message);
    }
  }

  if (!updatedOrder) {
    console.warn(`Order with reference ${reference} not found in database.`);
    // Still return 200 to PawaPay so they don't loop retries for an orphaned local reference
    return {
      status: 200,
      json: { received: true, warning: "Order not found" }
    };
  }

  console.log(`Order ${reference} successfully updated to: ${newOrderStatus} (${paymentStatus})`);

  // 4. Always respond with 200 OK immediately so PawaPay knows you received it
  return {
    status: 200,
    json: { received: true, orderId: reference, status: newOrderStatus, paymentStatus }
  };
}

// POST /api/webhooks/pawapay (Express Route Handler)
if (router && typeof router.post === 'function') {
  router.post('/pawapay', async (req, res) => {
    try {
      const result = await processPawaPayWebhook(req.body);
      return res.status(result.status).json(result.json);
    } catch (error) {
      console.error("Error processing PawaPay webhook:", error);
      // Return 500 only if it's a critical server error so PawaPay can retry safely later
      return res.status(500).json({ error: "Internal Server Error" });
    }
  });
}

export { router };
export default router;
