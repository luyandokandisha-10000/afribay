// ─────────────────────────────────────────────────────────────
// AfriBay — Firestore, Realtime DB & Storage helpers
// ─────────────────────────────────────────────────────────────
import {
  collection, doc, addDoc, setDoc, getDocs, getDoc, updateDoc, deleteDoc,
  query, where, orderBy, limit, serverTimestamp,
  writeBatch
} from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { auth, db, dbNamedDefault, storage, FIREBASE_CONFIG } from "./firebase.js";

const PROJECT_ID = FIREBASE_CONFIG.projectId || "afribay";
const API_KEY = FIREBASE_CONFIG.apiKey || "";
const RTDB_URL = (FIREBASE_CONFIG.databaseURL || "").replace(/\/$/, "");

let resolvedDbInstance = null;
let resolvedDbName = "(default)";
let resolveDbPromise = null;

function withTimeout(promise, ms = 4500) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(`Operation timed out after ${ms}ms`)), ms))
  ]);
}

async function probeFirestoreDbId(dbId) {
  const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), 2500) : null;
  try {
    const url = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/${encodeURIComponent(dbId)}/documents/products?pageSize=1&key=${API_KEY}`;
    const res = await fetch(url, { signal: controller ? controller.signal : undefined });
    return { dbId, status: res.status, exists: res.status !== 404 };
  } catch (e) {
    return { dbId, status: 0, exists: false, error: e.message };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function resolveActiveDb() {
  if (resolvedDbInstance) return resolvedDbInstance;
  if (resolveDbPromise) return resolveDbPromise;

  resolveDbPromise = (async () => {
    try {
      const [parensProbe, namedDefaultProbe] = await Promise.all([
        probeFirestoreDbId("(default)"),
        probeFirestoreDbId("default")
      ]);
      if (parensProbe.exists && db) {
        resolvedDbInstance = db;
        resolvedDbName = "(default)";
      } else if (namedDefaultProbe.exists && dbNamedDefault) {
        resolvedDbInstance = dbNamedDefault;
        resolvedDbName = "default";
      } else {
        resolvedDbInstance = db || dbNamedDefault;
        resolvedDbName = db ? "(default)" : "default";
      }
    } catch (_) {
      resolvedDbInstance = db || dbNamedDefault;
    }
    return resolvedDbInstance;
  })();

  return resolveDbPromise;
}

// ── Guard ─────────────────────────────────────────────────────
function requireDb() {
  const target = resolvedDbInstance || db || dbNamedDefault;
  if (!target) throw new Error("Firestore is not available. Complete the Firebase config in src/firebase.js.");
  return target;
}
function requireStorage() {
  if (!storage) throw new Error("Firebase Storage is not available. Complete the Firebase config in src/firebase.js.");
  return storage;
}

async function getIdTokenSafe() {
  try {
    if (auth && auth.currentUser) {
      return await withTimeout(auth.currentUser.getIdToken(), 2500);
    }
  } catch (_) {}
  return "";
}

async function rtdbRequest(path, method = "GET", body = null, token = "") {
  if (!RTDB_URL) return null;
  const authQuery = token ? `?auth=${encodeURIComponent(token)}` : "";
  const res = await withTimeout(fetch(`${RTDB_URL}/${path}.json${authQuery}`, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined
  }), 3500);
  if (!res.ok) {
    const errText = await res.text().catch(() => String(res.status));
    throw new Error(`RTDB ${res.status}: ${errText}`);
  }
  return res.json();
}

export async function checkCloudConnectionStatus() {
  const [parensProbe, namedProbe] = await Promise.all([
    probeFirestoreDbId("(default)"),
    probeFirestoreDbId("default")
  ]);

  let rtdbStatus = { status: 0, ok: false };
  if (RTDB_URL) {
    try {
      const token = await getIdTokenSafe();
      const authQ = token ? `?auth=${encodeURIComponent(token)}` : "";
      const r = await withTimeout(fetch(`${RTDB_URL}/products.json${authQ}`), 2500);
      rtdbStatus = { status: r.status, ok: r.ok };
    } catch (e) {
      rtdbStatus = { status: 0, ok: false, error: e.message };
    }
  }

  const activeProbe = parensProbe.exists ? parensProbe : (namedProbe.exists ? namedProbe : parensProbe);
  if (activeProbe.exists && activeProbe.status === 200) {
    return { ok: true, backend: "firestore", databaseId: activeProbe.dbId, status: 200, message: `Cloud Firestore (${activeProbe.dbId}) connected & public!` };
  }
  if (rtdbStatus.ok) {
    return { ok: true, backend: "rtdb", databaseId: "realtime-db", status: 200, message: "Firebase Realtime Database connected & live!" };
  }
  if (namedProbe.exists && namedProbe.status === 403) {
    return {
      ok: false,
      backend: "firestore",
      databaseId: "default",
      status: 403,
      reason: "PERMISSION_DENIED",
      message: "Database 'default' exists, but its Security Rules currently block reading products (403 PERMISSION_DENIED)."
    };
  }
  if (parensProbe.exists && parensProbe.status === 403) {
    return {
      ok: false,
      backend: "firestore",
      databaseId: "(default)",
      status: 403,
      reason: "PERMISSION_DENIED",
      message: "Database '(default)' exists, but its Security Rules currently block reading products (403 PERMISSION_DENIED)."
    };
  }
  return {
    ok: false,
    backend: "none",
    databaseId: "(default)",
    status: 404,
    reason: "NOT_FOUND",
    message: "Cloud Firestore database is not activated yet in Firebase Console."
  };
}

// ── User profile ──────────────────────────────────────────────
export async function upsertUserProfile(user) {
  const firestore = await resolveActiveDb();
  if (!firestore) return;
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
  const firestore = await resolveActiveDb();
  const now = Date.now();
  const trialExpiry = trialEndsAt || (now + 5 * 24 * 60 * 60 * 1000); // 5-day free trial default
  return withTimeout(addDoc(collection(firestore, "shops"), {
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
  }), 5000);
}

export async function loadUserShop(uid) {
  const firestore = await resolveActiveDb();
  const snap = await getDocs(
    query(collection(firestore, "shops"), where("userId", "==", uid), limit(1))
  );
  if (snap.empty) return null;
  const d = snap.docs[0];
  return { id: d.id, ...d.data() };
}

export async function deleteShop(uid, shopId) {
  const firestore = await resolveActiveDb();
  if (shopId) {
    try {
      await deleteDoc(doc(firestore, "shops", shopId));
    } catch (_) {}
  }
  try {
    const snap = await getDocs(
      query(collection(firestore, "products"), where("ownerId", "==", uid))
    );
    if (!snap.empty) {
      const batch = writeBatch(firestore);
      snap.docs.forEach(d => batch.delete(d.ref));
      await batch.commit();
    }
  } catch (_) {}
  return { success: true };
}

// ── Products ──────────────────────────────────────────────────
export async function createProduct(uid, productData) {
  const firestore = await resolveActiveDb();
  const payload = {
    ...productData,
    ownerId:    uid,
    ownerEmail: productData.ownerEmail || "",
    isFeatured: false,
    viewCount:  0,
    createdAtMs: Number(productData.createdAt || Date.now()),
  };

  let fsResult = null;
  let fsError = null;

  try {
    const docRef = await withTimeout(addDoc(collection(firestore, "products"), {
      ...payload,
      createdAt: serverTimestamp(),
    }), 5000);
    fsResult = docRef;
  } catch (err) {
    fsError = err;
    console.warn(`[AfriBay Firestore (${resolvedDbName}) createProduct error]:`, err.message);
  }

  // Also mirror to Firebase Realtime Database if authenticated & allowed
  let rtdbId = null;
  try {
    const token = await getIdTokenSafe();
    const safeId = fsResult?.id || productData.id || `prod_${Date.now()}`;
    await rtdbRequest(`products/${safeId}`, "PUT", { ...payload, id: safeId }, token);
    rtdbId = safeId;
  } catch (rtdbErr) {
    console.warn("[AfriBay RTDB createProduct notice]:", rtdbErr.message);
  }

  if (fsResult) return fsResult;
  if (rtdbId) return { id: rtdbId, backend: "rtdb" };
  throw fsError || new Error("Could not save product to Cloud Database.");
}

export async function deleteProduct(uid, productId) {
  const firestore = await resolveActiveDb();
  if (!productId) throw new Error("Missing productId");
  try {
    const prodRef = doc(firestore, "products", productId);
    await deleteDoc(prodRef);
  } catch (e) {
    console.warn("Firestore deleteProduct note:", e.message);
  }
  try {
    const token = await getIdTokenSafe();
    await rtdbRequest(`products/${productId}`, "DELETE", null, token);
  } catch (_) {}
  return { success: true };
}

export async function reportOrderDelayed(uid, trackingId, reason = "Product has not arrived in more than two days") {
  const firestore = await resolveActiveDb();
  if (!trackingId) throw new Error("Missing trackingId");
  return addDoc(collection(firestore, "delivery_reports"), {
    buyerUid: uid,
    trackingId,
    reason,
    status: "investigating",
    createdAt: serverTimestamp()
  });
}

export async function loadProducts() {
  const merged = new Map();
  let fsError = null;

  try {
    const firestore = await resolveActiveDb();
    let snap;
    try {
      snap = await withTimeout(
        getDocs(query(collection(firestore, "products"), orderBy("createdAt", "desc"), limit(80))),
        4500
      );
    } catch (indexOrOrderErr) {
      // Fallback: fetch collection without orderBy in case docs have mixed createdAt types or missing index
      snap = await withTimeout(getDocs(collection(firestore, "products")), 4500);
    }
    snap.docs.forEach(d => {
      const data = { id: d.id, ...d.data() };
      if (data.ownerId !== "demo" && data.ownerEmail !== "demo@afribay.com") {
        merged.set(String(data.id), data);
      }
    });
  } catch (err) {
    fsError = err;
    console.warn(`[AfriBay Firestore (${resolvedDbName}) loadProducts notice]:`, err.message);
  }

  // Also read from RTDB fallback (public or authenticated)
  try {
    const token = await getIdTokenSafe();
    const rtdbData = await rtdbRequest("products", "GET", null, token);
    if (rtdbData && typeof rtdbData === "object") {
      Object.entries(rtdbData).forEach(([key, val]) => {
        if (val && typeof val === "object" && val.ownerId !== "demo" && val.ownerEmail !== "demo@afribay.com") {
          const id = val.id || key;
          if (!merged.has(String(id))) {
            merged.set(String(id), { ...val, id });
          }
        }
      });
    }
  } catch (_) {}

  if (merged.size > 0) {
    return Array.from(merged.values()).sort((a, b) => {
      const tA = a.createdAt?.toMillis?.() || Number(a.createdAtMs || a.createdAt || 0);
      const tB = b.createdAt?.toMillis?.() || Number(b.createdAtMs || b.createdAt || 0);
      return tB - tA;
    });
  }

  if (fsError) throw fsError;
  return [];
}

export async function loadUserProducts(uid) {
  const firestore = await resolveActiveDb();
  const snap = await getDocs(
    query(collection(firestore, "products"), where("ownerId", "==", uid))
  );
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

// ── Video Ads ─────────────────────────────────────────────────
export async function createVideoAd(uid, { shopId, productId, videoUrl, caption, priceZMW, isPaid, duration }) {
  const firestore = await resolveActiveDb();
  return withTimeout(addDoc(collection(firestore, "video_ads"), {
    shopId,
    productId,
    videoUrl,
    caption:   caption   || "",
    priceZMW:  priceZMW  || 0,
    isPaid:    true,
    duration:  duration  || "daily",
    createdBy: uid,
    createdAt: serverTimestamp(),
  }), 5000);
}

export async function loadActiveAds() {
  const firestore = await resolveActiveDb();
  const snap = await getDocs(
    query(collection(firestore, "video_ads"), where("isPaid", "==", true), limit(20))
  );
  return snap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .filter(ad => ad.createdBy !== "demo");
}

// ── Cart ──────────────────────────────────────────────────────
export async function loadCart(uid) {
  const firestore = await resolveActiveDb();
  const snap = await getDocs(collection(firestore, "carts", uid, "items"));
  return snap.docs.map(d => ({ ...d.data() }));
}

export async function saveCart(uid, items) {
  const firestore = await resolveActiveDb();
  const itemsCol = collection(firestore, "carts", uid, "items");

  const existing = await withTimeout(getDocs(itemsCol), 2500);
  if (!existing.empty) {
    const deleteBatch = writeBatch(firestore);
    existing.docs.forEach(d => deleteBatch.delete(d.ref));
    await deleteBatch.commit();
  }

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
    await withTimeout(writeBatchInst.commit(), 2500);
  }
}

// ── Orders & Escrow ──────────────────────────────────────────
export async function createOrder(uid, order) {
  const firestore = await resolveActiveDb();
  const deliveryPin = order.deliveryPin || String(Math.floor(100000 + Math.random() * 900000));
  const escrowStatus = order.escrowStatus || "escrow_held";
  const payoutStatus = order.payoutStatus || "held_in_escrow";
  const deliveryStatus = order.deliveryStatus || "processing";
  const delivery_lat = order.delivery_lat != null ? Number(order.delivery_lat) : (order.deliveryLat != null ? Number(order.deliveryLat) : null);
  const delivery_lng = order.delivery_lng != null ? Number(order.delivery_lng) : (order.deliveryLng != null ? Number(order.deliveryLng) : null);
  const deliveryZone = order.deliveryZone || "lusaka_local";
  const shippingFee = order.shippingFee != null ? Number(order.shippingFee) : (order.deliveryFee != null ? Number(order.deliveryFee) : 45);
  const city = order.city || order.deliveryCity || "Lusaka";
  const landmarkAddress = order.landmarkAddress || order.deliveryLandmark || order.deliveryAddress || "";
  const customerPhone = order.customerPhone || order.deliveryPhone || order.phoneNumber || order.customer?.phone || "";
  const totalAmount = order.totalAmount != null ? Number(order.totalAmount) : Number(order.totalZMW || order.amount || 0);

  const orderRecord = {
    ...order,
    deliveryPin,
    deliveryZone,
    shippingFee,
    city,
    landmarkAddress,
    customerPhone,
    totalAmount,
    totalZMW: totalAmount,
    delivery_lat: delivery_lat,
    delivery_lng: delivery_lng,
    escrowStatus,
    payoutStatus,
    deliveryStatus,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  try {
    const docRef = await withTimeout(
      addDoc(collection(firestore, "orders", uid, "history"), orderRecord),
      2500
    );

    if (order.trackingId) {
      try {
        await withTimeout(
          setDoc(doc(firestore, "escrow_registry", order.trackingId), {
            ...orderRecord,
            buyerUid: uid,
            orderDocId: docRef?.id || order.trackingId
          }),
          2000
        );
      } catch (_) {}
    }

    return { id: docRef?.id || order.trackingId, ...orderRecord };
  } catch (err) {
    console.warn("[Firestore createOrder] Saved locally (offline or timeout):", err.message);
    return { id: order.trackingId || `local-${Date.now()}`, ...orderRecord };
  }
}

export async function assignOrderTransit(uid, orderDocId, riderInfo = {}) {
  const firestore = await resolveActiveDb();
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
  const firestore = await resolveActiveDb();
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
  const firestore = await resolveActiveDb();
  const snap = await getDocs(
    query(collection(firestore, "orders", uid, "history"), orderBy("createdAt", "desc"), limit(50))
  );
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function seedMarketplace() {
  return;
}

export async function wipeDummyDataFromFirestore() {
  try {
    const firestore = await resolveActiveDb();
    if (!firestore) return;
    const dummyOwners = ["demo", "demo@afribay.com"];
    const dummyShops = ["Lusaka Motors", "Mimi's Closet", "SmartHub Zambia", "Second Lap", "Home Tech ZA", "Naya Collective"];

    const prodSnap = await withTimeout(getDocs(collection(firestore, "products")), 3000);
    const deleteBatch = writeBatch(firestore);
    let count = 0;
    prodSnap.docs.forEach(docSnap => {
      const data = docSnap.data();
      if (dummyOwners.includes(data.ownerId) || dummyOwners.includes(data.ownerEmail) || dummyShops.includes(data.shopName)) {
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
  const doUpload = async () => {
    const snapshot = await uploadBytes(storageRef, file);
    return getDownloadURL(snapshot.ref);
  };
  return withTimeout(doUpload(), 6000);
}
