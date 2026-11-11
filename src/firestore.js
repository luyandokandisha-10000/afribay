// ─────────────────────────────────────────────────────────────
// AfriBay — Firestore & Storage helpers
// ─────────────────────────────────────────────────────────────
import {
  collection, doc, addDoc, setDoc, getDocs, getDoc, updateDoc,
  query, where, orderBy, limit, serverTimestamp,
  writeBatch, getCountFromServer
} from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { db, storage } from "./firebase.js";

// ── Guard ─────────────────────────────────────────────────────
function requireDb() {
  if (!db) throw new Error("Firestore is not available. Complete the Firebase config in src/firebase.js.");
  return db;
}
function requireStorage() {
  if (!storage) throw new Error("Firebase Storage is not available. Complete the Firebase config in src/firebase.js.");
  return storage;
}

// ── User profile ──────────────────────────────────────────────
export async function upsertUserProfile(user) {
  const firestore = requireDb();
  await setDoc(
    doc(firestore, "users", user.uid),
    {
      displayName: user.displayName || "",
      email:       user.email       || "",
      photoURL:    user.photoURL    || "",
      lastSeen:    serverTimestamp(),
      updatedAt:   serverTimestamp(),
    },
    { merge: true }
  );
}

export async function createShop(uid, { shopName, mtnPhone, airtelPhone, contactPhone, payoutPreference, description, logoUrl, shop_lat, shop_lng, physicalAddress, trialEndsAt, subscriptionStatus }) {
  const firestore = requireDb();
  const now = Date.now();
  const trialExpiry = trialEndsAt || (now + 5 * 24 * 60 * 60 * 1000); // 5-day free trial default
  return addDoc(collection(firestore, "shops"), {
    userId:             uid,
    shopName:           shopName           || "",
    mtnPhone:           mtnPhone           || "",
    airtelPhone:        airtelPhone        || "",
    contactPhone:       contactPhone       || mtnPhone || airtelPhone || "",
    payoutPreference:   payoutPreference   || "mobile_money", // 'mobile_money' | 'cash_collection'
    description:        description        || "",
    logoUrl:            logoUrl            || "",
    shop_lat:           shop_lat != null ? Number(shop_lat) : null,
    shop_lng:           shop_lng != null ? Number(shop_lng) : null,
    physicalAddress:    physicalAddress    || "",
    trialEndsAt:        trialExpiry,
    subscriptionStatus: subscriptionStatus || "trial", // 'trial' | 'active' | 'expired'
    subscriptionTier:   null,
    subscriptionEndsAt: null,
    status:             "active",
    createdAt:          serverTimestamp(),
    updatedAt:          serverTimestamp(),
  });
}

export async function loadUserShop(uid) {
  const firestore = requireDb();
  const snap = await getDocs(
    query(collection(firestore, "shops"), where("userId", "==", uid), limit(1))
  );
  if (snap.empty) return null;
  const d = snap.docs[0];
  return { id: d.id, ...d.data() };
}

// ── Products ──────────────────────────────────────────────────
export async function createProduct(uid, productData) {
  const firestore = requireDb();
  return addDoc(collection(firestore, "products"), {
    ...productData,
    ownerId:    uid,
    ownerEmail: "",
    isFeatured: false,
    viewCount:  0,
    createdAt:  serverTimestamp(),
  });
}

export async function loadProducts() {
  const firestore = requireDb();
  const snap = await getDocs(
    query(collection(firestore, "products"), orderBy("createdAt", "desc"), limit(80))
  );
  return snap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .filter(p => p.ownerId !== "demo" && p.ownerEmail !== "demo@afribay.com");
}

export async function loadUserProducts(uid) {
  const firestore = requireDb();
  const snap = await getDocs(
    query(collection(firestore, "products"), where("ownerId", "==", uid))
  );
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

// ── Video Ads ─────────────────────────────────────────────────
export async function createVideoAd(uid, { shopId, productId, videoUrl, caption, priceZMW, isPaid, duration }) {
  const firestore = requireDb();
  return addDoc(collection(firestore, "video_ads"), {
    shopId,
    productId,
    videoUrl,
    caption:   caption   || "",
    priceZMW:  priceZMW  || 0,
    isPaid:    true,
    duration:  duration  || "daily",
    createdBy: uid,
    createdAt: serverTimestamp(),
  });
}

export async function loadActiveAds() {
  const firestore = requireDb();
  const snap = await getDocs(
    query(collection(firestore, "video_ads"), where("isPaid", "==", true), limit(20))
  );
  return snap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .filter(ad => ad.createdBy !== "demo");
}

// ── Cart ──────────────────────────────────────────────────────
export async function loadCart(uid) {
  const firestore = requireDb();
  const snap = await getDocs(collection(firestore, "carts", uid, "items"));
  return snap.docs.map(d => ({ ...d.data() }));
}

export async function saveCart(uid, items) {
  const firestore = requireDb();
  const itemsCol = collection(firestore, "carts", uid, "items");

  // 1. Delete existing cart items
  const existing = await getDocs(itemsCol);
  if (!existing.empty) {
    const deleteBatch = writeBatch(firestore);
    existing.docs.forEach(d => deleteBatch.delete(d.ref));
    await deleteBatch.commit();
  }

  // 2. Write new items
  if (items.length > 0) {
    const writeBatchInst = writeBatch(firestore);
    items.forEach(item => {
      const itemRef = doc(itemsCol, String(item.productId));
      writeBatchInst.set(itemRef, {
        productId: String(item.productId),
        quantity:  Number(item.quantity  || 1),
        priceZMW:  Number(item.priceZMW  || 0),
      });
    });
    await writeBatchInst.commit();
  }
}

// ── Orders & Escrow ──────────────────────────────────────────
export async function createOrder(uid, order) {
  const firestore = requireDb();
  const deliveryPin = order.deliveryPin || String(Math.floor(100000 + Math.random() * 900000));
  const escrowStatus = order.escrowStatus || "escrow_held";
  const payoutStatus = order.payoutStatus || "held_in_escrow";
  const deliveryStatus = order.deliveryStatus || "processing";
  const delivery_lat = order.delivery_lat != null ? Number(order.delivery_lat) : (order.deliveryLat != null ? Number(order.deliveryLat) : null);
  const delivery_lng = order.delivery_lng != null ? Number(order.delivery_lng) : (order.deliveryLng != null ? Number(order.deliveryLng) : null);

  const orderRecord = {
    ...order,
    deliveryPin,
    delivery_lat: delivery_lat,
    delivery_lng: delivery_lng,
    escrowStatus,
    payoutStatus,
    deliveryStatus,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  const docRef = await addDoc(collection(firestore, "orders", uid, "history"), orderRecord);

  // Also maintain top-level escrow tracking index if trackingId exists
  if (order.trackingId) {
    try {
      await setDoc(doc(firestore, "escrow_registry", order.trackingId), {
        ...orderRecord,
        buyerUid: uid,
        orderDocId: docRef.id
      });
    } catch (_) {}
  }

  return { id: docRef.id, ...orderRecord };
}

export async function assignOrderTransit(uid, orderDocId, riderInfo = {}) {
  const firestore = requireDb();
  const orderRef = doc(firestore, "orders", uid, "history", orderDocId);
  await updateDoc(orderRef, {
    escrowStatus: "in_transit",
    deliveryStatus: "in_transit",
    riderAssigned: riderInfo.riderName || "AfriBay Courier",
    riderPhone: riderInfo.riderPhone || "+260 97 000000",
    dispatchedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

export async function verifyDeliveryAndReleaseEscrow(uid, orderDocId, inputPin, verifiedBy = "rider") {
  const firestore = requireDb();
  const orderRef = doc(firestore, "orders", uid, "history", orderDocId);
  const snap = await getDoc(orderRef);
  if (!snap.exists()) {
    throw new Error("Order not found");
  }
  const data = snap.data();
  if (String(data.deliveryPin || "").trim() !== String(inputPin || "").trim()) {
    throw new Error("Invalid delivery confirmation PIN. Escrow remains held.");
  }
  await updateDoc(orderRef, {
    escrowStatus: "completed",
    deliveryStatus: "delivered",
    payoutStatus: "released",
    verifiedBy,
    releasedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return { success: true, released: true };
}

export async function loadOrders(uid) {
  const firestore = requireDb();
  const snap = await getDocs(
    query(collection(firestore, "orders", uid, "history"), orderBy("createdAt", "desc"), limit(50))
  );
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function seedMarketplace() {
  // Database Cleanup: No fake/dummy products or shops are seeded.
  // Marketplace starts completely clean for genuine registered sellers and real products.
  return;
}

export async function wipeDummyDataFromFirestore() {
  try {
    if (!db) return;
    const dummyOwners = ["demo", "demo@afribay.com"];
    const dummyShops = ["Lusaka Motors", "Mimi's Closet", "SmartHub Zambia", "Second Lap", "Home Tech ZA", "Naya Collective"];
    
    // Purge demo products
    const prodSnap = await getDocs(collection(db, "products"));
    const deleteBatch = writeBatch(db);
    let count = 0;
    prodSnap.docs.forEach(docSnap => {
      const data = docSnap.data();
      if (dummyOwners.includes(data.ownerId) || dummyOwners.includes(data.ownerEmail) || dummyShops.includes(data.shopName)) {
        deleteBatch.delete(docSnap.ref);
        count++;
      }
    });

    // Purge demo video ads
    const adsSnap = await getDocs(collection(db, "video_ads"));
    adsSnap.docs.forEach(docSnap => {
      const data = docSnap.data();
      if (dummyOwners.includes(data.createdBy)) {
        deleteBatch.delete(docSnap.ref);
        count++;
      }
    });

    // Purge demo shops
    const shopSnap = await getDocs(collection(db, "shops"));
    shopSnap.docs.forEach(docSnap => {
      const data = docSnap.data();
      if (dummyShops.includes(data.shopName) || dummyOwners.includes(data.userId)) {
        deleteBatch.delete(docSnap.ref);
        count++;
      }
    });

    if (count > 0) {
      await deleteBatch.commit();
      console.log(`[AfriBay] Successfully purged ${count} legacy demo documents from Cloud Firestore.`);
    }
  } catch (err) {
    console.warn("[AfriBay] Firestore cleanup notice:", err.message);
  }
}

// ── Storage ───────────────────────────────────────────────────
export async function uploadUserMedia(uid, file, folder) {
  const stor = requireStorage();
  const filename = `${folder}/${uid}/${Date.now()}-${file.name}`;
  const storageRef = ref(stor, filename);
  const snapshot = await uploadBytes(storageRef, file);
  return getDownloadURL(snapshot.ref);
}
