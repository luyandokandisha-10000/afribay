/**
 * AfriBay Order Model (Mongoose-compatible & Standalone ORM / Memory Adapter)
 * 
 * Supports both:
 * 1. Mongoose Schema/Model when mongoose is connected to MongoDB.
 * 2. Standalone fallback when running in memory, local storage, or without active MongoDB.
 */

let OrderModel;

try {
  // If mongoose is available in the environment, use real Mongoose model
  const mongoose = await import('mongoose');
  if (mongoose && mongoose.Schema) {
    const OrderSchema = new mongoose.Schema({
      orderId: { type: String, required: true, unique: true, index: true },
      trackingId: { type: String, index: true },
      status: { type: String, default: 'Pending_Payment' },
      paymentStatus: { type: String, default: 'Pending' },
      escrowStatus: { type: String, default: 'escrow_held' },
      deliveryStatus: { type: String, default: 'processing' },
      payoutStatus: { type: String, default: 'held_in_escrow' },
      pawaPayDepositId: { type: String },
      flutterwaveTransactionId: { type: String },
      amount: { type: Number },
      totalZMW: { type: Number },
      vendorPayoutZMW: { type: Number },
      deliveryPin: { type: String },
      deliveryAddress: { type: String },
      delivery_lat: { type: Number },
      delivery_lng: { type: Number },
      items: { type: Array, default: [] },
      customer: { type: Object, default: {} },
      createdAt: { type: Date, default: Date.now },
      updatedAt: { type: Date, default: Date.now }
    });

    OrderModel = mongoose.models?.Order || mongoose.model('Order', OrderSchema);
  }
} catch (_) {
  // Mongoose not installed or MongoDB not connected - fallback used below
}

// Fallback in-memory and registry model implementation with Mongoose-like findOneAndUpdate
if (!OrderModel) {
  const memoryStore = new Map();

  OrderModel = {
    _store: memoryStore,

    async findOne(filter = {}) {
      const orderId = filter.orderId || filter.trackingId || filter._id;
      if (orderId && memoryStore.has(orderId)) {
        return memoryStore.get(orderId);
      }
      for (const order of memoryStore.values()) {
        if (filter.orderId && (order.orderId === filter.orderId || order.trackingId === filter.orderId)) return order;
        if (filter.trackingId && (order.trackingId === filter.trackingId || order.orderId === filter.trackingId)) return order;
        if (filter._id && (order._id === filter._id || order.orderId === filter._id)) return order;
      }
      return null;
    },

    async findOneAndUpdate(filter = {}, update = {}, options = {}) {
      const targetId = filter.orderId || filter.trackingId || filter._id;
      let existing = null;

      if (targetId && memoryStore.has(targetId)) {
        existing = memoryStore.get(targetId);
      } else {
        for (const [key, order] of memoryStore.entries()) {
          if (targetId && (order.orderId === targetId || order.trackingId === targetId || order._id === targetId || key === targetId)) {
            existing = order;
            break;
          }
        }
      }

      if (!existing && !options.upsert) {
        return null;
      }

      const updated = {
        ...(existing || { orderId: targetId, trackingId: targetId, createdAt: new Date() }),
        ...update,
        updatedAt: update.updatedAt || new Date()
      };

      const key = updated.orderId || updated.trackingId || targetId;
      memoryStore.set(key, updated);
      if (updated.trackingId) memoryStore.set(updated.trackingId, updated);
      if (updated.orderId) memoryStore.set(updated.orderId, updated);

      return updated;
    },

    async create(orderData = {}) {
      const id = orderData.orderId || orderData.trackingId || `AFB-${Date.now().toString(36).toUpperCase()}`;
      const record = {
        orderId: id,
        trackingId: id,
        status: 'Pending_Payment',
        paymentStatus: 'Pending',
        escrowStatus: 'escrow_held',
        deliveryStatus: 'processing',
        payoutStatus: 'held_in_escrow',
        createdAt: new Date(),
        updatedAt: new Date(),
        ...orderData
      };
      memoryStore.set(id, record);
      return record;
    }
  };
}

export default OrderModel;
