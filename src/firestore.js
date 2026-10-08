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

// ── Shops ─────────────────────────────────────────────────────
export async function createShop(uid, { shopName, contactPhone, description, logoUrl }) {
  const firestore = requireDb();
  return addDoc(collection(firestore, "shops"), {
    userId:       uid,
    shopName:     shopName     || "",
    contactPhone: contactPhone || "",
    description:  description  || "",
    logoUrl:      logoUrl      || "",
    status:       "active",
    createdAt:    serverTimestamp(),
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
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
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
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
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

  const orderRecord = {
    ...order,
    deliveryPin,
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

// ── Seed ─────────────────────────────────────────────────────
export async function seedMarketplace() {
  const firestore = requireDb();
  const productsCol = collection(firestore, "products");

  // Only seed if the collection is empty
  const countSnap = await getCountFromServer(productsCol);
  if (countSnap.data().count > 0) return;

  const seeds = [
    { title: "Toyota Vitz 2015",        priceZMW: 98000, category: "cars",        condition: "used_good",     location: "Lusaka, Zambia",     shopName: "Lusaka Motors",    art: "🚙", artClass: "t1", isFeatured: true,  videoUrl: "https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4" },
    { title: "Vintage denim jacket",    priceZMW: 420,   category: "clothes",     condition: "used_like_new", location: "Lusaka, Zambia",     shopName: "Mimi's Closet",   art: "🧥", artClass: "t2", isFeatured: true,  videoUrl: "https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4" },
    { title: "iPhone 13 128GB",         priceZMW: 11500, category: "electronics", condition: "used_like_new", location: "Kitwe, Zambia",      shopName: "SmartHub Zambia", art: "📱", artClass: "t3", isFeatured: false, videoUrl: "" },
    { title: "Nike Air Max sneakers",   priceZMW: 850,   category: "clothes",     condition: "used_good",     location: "Ndola, Zambia",      shopName: "Second Lap",      art: "👟", artClass: "t4", isFeatured: false, videoUrl: "" },
    { title: "Samsung smart television",priceZMW: 7200,  category: "electronics", condition: "used_like_new", location: "Livingstone, Zambia", shopName: "Home Tech ZA",   art: "📺", artClass: "t5", isFeatured: false, videoUrl: "" },
    { title: "New African print shirt", priceZMW: 380,   category: "new_goods",   condition: "new",           location: "Lusaka, Zambia",     shopName: "Naya Collective", art: "👕", artClass: "t6", isFeatured: false, videoUrl: "" },
  ];

  for (const seed of seeds) {
    await addDoc(productsCol, {
      ...seed,
      ownerId:     "verified_seller",
      ownerEmail:  "store@afribay.com",
      description: "",
      imageUrls:   [],
      viewCount:   0,
      createdAt:   serverTimestamp(),
    });
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
