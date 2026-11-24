import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let testsPassed = 0;
let testsFailed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  ✓ PASS: ${message}`);
    testsPassed++;
  } else {
    console.error(`  ✗ FAIL: ${message}`);
    testsFailed++;
  }
}

async function request(url, options = {}) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const req = http.request({
      hostname: parsed.hostname,
      port: parsed.port,
      path: parsed.pathname + parsed.search,
      method: options.method || 'GET',
      headers: options.headers || {},
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        let json = null;
        try {
          json = JSON.parse(data);
        } catch (_) {}
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          body: data,
          json,
        });
      });
    });
    req.on('error', reject);
    if (options.body) {
      req.write(typeof options.body === 'string' ? options.body : JSON.stringify(options.body));
    }
    req.end();
  });
}

async function runTestSuite() {
  console.log('====================================================');
  console.log('   AFRIBAY PLATFORM & ESCROW AUTOMATED TEST SUITE   ');
  console.log('====================================================\n');

  // ----------------------------------------------------
  // TEST SECTION 1: HTML & DOM Integrity Checks
  // ----------------------------------------------------
  console.log('[SECTION 1] HTML DOM Integrity & Dual File Parity');
  
  const indexHtml = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
  const prototypeHtml = fs.readFileSync(path.join(__dirname, 'afrothrift-prototype (2).html'), 'utf8');

  assert(indexHtml === prototypeHtml, 'index.html and afrothrift-prototype (2).html are identical');

  const requiredElementIds = [
    'shopName', 'shopMtnPhone', 'shopAirtelPhone', 'shopPayoutPreference', 'shopPhone', 'shopAddressInput', 'shopLat', 'shopLng', 'shopGpsLabel', 'shopSubmitBtn', 'shopError',
    'deliveryTabGps', 'deliveryTabAddress', 'deliveryGpsSection', 'deliveryAddressSection',
    'deliveryAddress', 'deliveryLat', 'deliveryLng', 'deliveryGpsLabel', 'checkoutTotal', 'checkoutError',
    'deliveryZoneSelect', 'deliveryCity', 'deliveryLandmark', 'deliveryPhone',
    'checkoutSubtotal', 'checkoutShippingFee', 'checkoutGrandTotal',
    'podFields', 'podVendorPref', 'podVendorMtn', 'podVendorAirtel', 'podBuyerPhone',
    'receiptTracking', 'receiptAmount', 'receiptPin', 'receiptGpsInfo', 'receiptMapsLink', 'receiptEscrowBadge',
    'receiptPodInfo', 'receiptVendorName', 'receiptVendorMtn', 'receiptVendorAirtel', 'receiptVendorPref',
    'cartList', 'subtotal', 'delivery', 'total',
    'subscriptionModal', 'subTierSelect', 'subPaymentLine', 'subTxRef', 'subSubmitBtn',
    'sellerProducts', 'sellerViews', 'sellerProductCount', 'sellerAdCount',
    'sellerAvailablePayout', 'sellerEscrowHeld', 'sellerOrdersCount', 'sellerFulfillmentList',
    'catalogSyncCard', 'copySyncLinkBtn', 'copySyncCodeBtn', 'downloadCatalogJsonBtn',
    'catalogSyncCodeInput', 'applySyncCodeBtn', 'uploadCatalogJsonFile',
    'cloudStatusBox', 'cloudStatusBadge', 'cloudStatusDetail', 'pushLocalToCloudBtn'
  ];

  for (const id of requiredElementIds) {
    const hasElement = indexHtml.includes(`id="${id}"`);
    assert(hasElement, `DOM element id="${id}" exists in HTML`);
  }

  // Check Multi-Device Catalog Sync methods
  assert(indexHtml.includes('window.exportCatalogSyncCode'), 'exportCatalogSyncCode exported to window');
  assert(indexHtml.includes('window.importCatalogData'), 'importCatalogData exported to window');
  assert(indexHtml.includes('window.copyCatalogSyncLink'), 'copyCatalogSyncLink exported to window');
  assert(indexHtml.includes('window.checkCatalogSyncParam'), 'checkCatalogSyncParam exported to window');
  assert(indexHtml.includes('checkCatalogSyncParam()'), 'checkCatalogSyncParam invoked at page startup');
  assert(indexHtml.includes('window.refreshCloudDatabaseStatus'), 'refreshCloudDatabaseStatus exported to window');
  assert(indexHtml.includes('window.syncLocalProductsToCloud'), 'syncLocalProductsToCloud exported to window');

  // Check Fast Mobile Checkout FormSubmit immediate submit logic
  assert(indexHtml.includes('HTMLFormElement.prototype.submit.call(checkoutForm)'), 'Direct FormSubmit form submission configured for GitHub Pages');
  assert(indexHtml.includes('submitBtn.textContent = "✓ Order placed! Redirecting..."'), 'Immediate visual feedback on order placement');

  // Check Firebase Realtime Database & named "default" Firestore DB configuration
  const firebaseConfigCode = fs.readFileSync(path.join(__dirname, 'src', 'firebase.js'), 'utf8');
  assert(firebaseConfigCode.includes('https://afribay-default-rtdb.europe-west1.firebasedatabase.app'), 'Firebase Realtime Database URL configured in src/firebase.js');
  assert(firebaseConfigCode.includes('getFirestore(app, "default")'), 'Named Firestore database "default" fallback configured in src/firebase.js');

  // Check official subscription payment lines
  assert(indexHtml.includes('0760312951'), 'Official MTN subscription line 0760312951 exists in HTML');
  assert(indexHtml.includes('0778085670'), 'Official Airtel subscription line 0778085670 exists in HTML');

  // Check 5 official social channel links
  const officialSocialLinks = [
    'https://www.facebook.com/groups/4159169450883484',
    'https://www.facebook.com/profile.php?id=61575486501290',
    'https://www.linkedin.com/in/nexgen-founder-18518240a/',
    'https://www.reddit.com/user/next-gen-founder/?persist-lb-on-conversion=true&screen_view_count=1&ext-referrer=SEO',
    'https://www.instagram.com/real_nextgen_founder/'
  ];
  for (const link of officialSocialLinks) {
    assert(indexHtml.includes(link), `Official social link present: ${link}`);
  }

  // Check database reset: zero hardcoded mock products
  assert(indexHtml.includes('const products = [];'), 'products array initialized empty with zero dummy data');
  assert(!indexHtml.includes("shopName: \"Mimi's Closet\""), 'No dummy Mimi\'s Closet listings in client code');

  // ----------------------------------------------------
  // TEST SECTION 2: Firestore & Firebase Exports
  // ----------------------------------------------------
  console.log('\n[SECTION 2] Firestore API & Schemas');
  const firestoreCode = fs.readFileSync(path.join(__dirname, 'src', 'firestore.js'), 'utf8');
  assert(firestoreCode.includes('export async function createShop'), 'src/firestore.js exports createShop');
  assert(firestoreCode.includes('shop_lat:') && firestoreCode.includes('shop_lng:'), 'createShop schema persists shop_lat & shop_lng');
  assert(firestoreCode.includes('export async function createOrder'), 'src/firestore.js exports createOrder');
  assert(firestoreCode.includes('delivery_lat:') && firestoreCode.includes('delivery_lng:'), 'createOrder schema persists delivery_lat & delivery_lng');
  assert(firestoreCode.includes('export async function createVideoAd'), 'src/firestore.js exports createVideoAd');

  // ----------------------------------------------------
  // TEST SECTION 3: Flutter Module Structure & Classes
  // ----------------------------------------------------
  console.log('\n[SECTION 3] Flutter Location Module & Integration');
  const flutterFiles = [
    'flutter/pubspec.yaml',
    'flutter/README.md',
    'flutter/lib/models/location_result.dart',
    'flutter/lib/services/location_service.dart',
    'flutter/lib/widgets/location_picker_screen.dart',
    'flutter/lib/screens/checkout_screen.dart',
    'flutter/lib/screens/shop_setup_screen.dart',
    'flutter/android/app/src/main/AndroidManifest.xml',
    'flutter/ios/Runner/Info.plist',
  ];

  for (const f of flutterFiles) {
    const exists = fs.existsSync(path.join(__dirname, f));
    assert(exists, `Flutter file exists: ${f}`);
  }

  const pubspec = fs.readFileSync(path.join(__dirname, 'flutter/pubspec.yaml'), 'utf8');
  assert(pubspec.includes('google_maps_flutter:'), 'pubspec.yaml includes google_maps_flutter');
  assert(pubspec.includes('geolocator:'), 'pubspec.yaml includes geolocator');

  const locPicker = fs.readFileSync(path.join(__dirname, 'flutter/lib/widgets/location_picker_screen.dart'), 'utf8');
  assert(locPicker.includes('onCameraMove:'), 'LocationPickerScreen handles onCameraMove for dynamic center pin');
  assert(locPicker.includes('FloatingActionButton.extended'), 'LocationPickerScreen has "Use Current Location" FAB');
  assert(locPicker.includes('widget.confirmButtonText'), 'LocationPickerScreen has confirm location button');

  // ----------------------------------------------------
  // TEST SECTION 4: Live Server & Escrow / GPS Endpoints
  // ----------------------------------------------------
  console.log('\n[SECTION 4] Backend Node.js Server & Escrow API');
  
  // Set test port
  process.env.PORT = '5010';
  process.env.NODE_ENV = 'test';

  // Import app server dynamically
  const { default: server } = await import('./server/app.js');

  await new Promise(r => setTimeout(r, 1000));
  const testBaseUrl = 'http://localhost:5010';

  try {
    // 4.1 Health Check
    const healthRes = await request(`${testBaseUrl}/api/health`);
    assert(healthRes.statusCode === 200 && healthRes.json?.status === 'ok', 'GET /api/health responds with status: ok');

    // 4.2 Checkout Initiation with GPS Coordinates
    const mockOrderPayload = {
      customer: {
        name: 'Chanda Bwalya',
        email: 'chanda@afribay.test',
        phone: '+260977123456',
      },
      items: [
        { title: 'Vintage Leather Jacket', quantity: 1, priceZMW: 450, shopName: "Kofi's Thrift" }
      ],
      amount: 485, // 450 + 35 delivery fee
      paymentMethod: 'mobile_money_mtn',
      deliveryAddress: 'Plot 104, Woodlands, Lusaka',
      delivery_lat: -15.387521,
      delivery_lng: 28.322814,
    };

    const checkoutRes = await request(`${testBaseUrl}/api/checkout/initiate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: mockOrderPayload,
    });

    assert(checkoutRes.statusCode === 200, 'POST /api/checkout/initiate returns 200 OK');
    assert(checkoutRes.json?.trackingId?.startsWith('AFB-'), `Returns valid tracking ID: ${checkoutRes.json?.trackingId}`);
    assert(checkoutRes.json?.deliveryPin?.length === 6, `Generated 6-digit drop-off PIN: ${checkoutRes.json?.deliveryPin}`);
    assert(checkoutRes.json?.escrowStatus === 'escrow_held', 'Initial escrow status is "escrow_held"');
    assert(checkoutRes.json?.delivery_lat === -15.387521, 'Preserves delivery_lat in response');
    assert(checkoutRes.json?.delivery_lng === 28.322814, 'Preserves delivery_lng in response');
    assert(checkoutRes.json?.courierMapsUrl?.includes('google.com/maps?q=-15.387521,28.322814'), 'Generates driver navigation link courierMapsUrl');

    // 4.2b: Checkout with GPS Pin alone (no written address required)
    const gpsOnlyOrder = {
      customer: { name: 'Mutale Mwila', email: 'mutale@afribay.test' },
      items: [{ title: 'African Print Shirt', quantity: 1, priceZMW: 380, shopName: 'Naya Collective' }],
      amount: 415,
      delivery_lat: -15.4200,
      delivery_lng: 28.3100,
    };
    const gpsOnlyRes = await request(`${testBaseUrl}/api/checkout/initiate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: gpsOnlyOrder,
    });
    assert(gpsOnlyRes.statusCode === 200, 'POST /api/checkout/initiate succeeds with GPS Pin alone (no written address)');
    assert(gpsOnlyRes.json?.courierMapsUrl?.includes('-15.42,28.31'), 'GPS-only checkout produces valid courierMapsUrl');

    // 4.2c: Checkout with Written Address alone (no GPS pin required)
    const addressOnlyOrder = {
      customer: { name: 'Kabwe Tembo', email: 'kabwe@afribay.test' },
      items: [{ title: 'iPhone Case', quantity: 1, priceZMW: 120, shopName: 'SmartHub' }],
      amount: 155,
      deliveryAddress: 'House 12, Rhodes Park, Lusaka',
    };
    const addressOnlyRes = await request(`${testBaseUrl}/api/checkout/initiate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: addressOnlyOrder,
    });
    assert(addressOnlyRes.statusCode === 200, 'POST /api/checkout/initiate succeeds with Written Address alone (no GPS pin)');

    const trackingId = checkoutRes.json.trackingId;
    const deliveryPin = checkoutRes.json.deliveryPin;

    // 4.3 Check Order Status
    const statusRes = await request(`${testBaseUrl}/api/escrow/status/${trackingId}`);
    assert(statusRes.statusCode === 200 && statusRes.json?.order?.escrowStatus === 'escrow_held', 'GET /api/escrow/status/:trackingId returns held order');

    // 4.4 Handover to Courier (Transition to in_transit)
    const transitRes = await request(`${testBaseUrl}/api/escrow/in-transit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: { trackingId },
    });
    assert(transitRes.statusCode === 200 && transitRes.json?.escrowStatus === 'in_transit', 'POST /api/escrow/in-transit transitions to "in_transit"');

    // 4.5 Attempt Release with Incorrect PIN (Security check)
    const badPinRes = await request(`${testBaseUrl}/api/escrow/release`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: { trackingId, deliveryPin: '000000' },
    });
    assert(badPinRes.statusCode === 400, 'POST /api/escrow/release rejects incorrect PIN with 400 Bad Request');

    // 4.6 Drop-off & Payout Release with Correct PIN
    const goodPinRes = await request(`${testBaseUrl}/api/escrow/release`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: { trackingId, deliveryPin },
    });
    assert(goodPinRes.statusCode === 200 && goodPinRes.json?.escrowStatus === 'completed', 'POST /api/escrow/release with correct PIN completes order');
    assert(goodPinRes.json?.payoutStatus === 'released', 'Vendor payout status is updated to "released"');

    // 4.7 Order Notification Email Endpoint & luyandokandisha@gmail.com Formatting
    const notifyRes = await request(`${testBaseUrl}/api/orders/notify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: {
        trackingId: 'AFB-TEST-NOTIFY-01',
        totalZMW: 320,
        deliveryAddress: 'Kalingalinga, Lusaka',
        delivery_lat: -15.4123,
        delivery_lng: 28.3456,
        items: [{ title: 'Nike Air Max', quantity: 1, priceZMW: 320, shopName: 'Lusaka Kicks' }],
      },
    });

    assert(notifyRes.statusCode === 200, 'POST /api/orders/notify responds 200 OK');
    assert(notifyRes.json?.recipient === 'luyandokandisha@gmail.com', 'Recipient is configured to luyandokandisha@gmail.com');
    assert(notifyRes.json?.courierMapsUrl?.includes('-15.4123,28.3456'), 'Notification payload includes Google Maps courier link');

    // 4.7b: Order Notification with Delivery Zone & Courier Fields
    const zoneNotifyRes = await request(`${testBaseUrl}/api/orders/notify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: {
        trackingId: 'AFB-TEST-ZONE-01',
        deliveryZone: 'lusaka_local',
        subtotal: 200,
        city: 'Lusaka',
        landmarkAddress: 'Woodlands, near Crossroads Mall',
        customerPhone: '0971234567',
        items: [{ title: 'Kitenge Shirt', quantity: 1, priceZMW: 200, shopName: 'AfriBay Store' }]
      }
    });
    assert(zoneNotifyRes.statusCode === 200, 'POST /api/orders/notify with delivery zone responds 200 OK');
    assert(zoneNotifyRes.json?.deliveryZone === 'lusaka_local', 'Order persists deliveryZone: "lusaka_local"');
    assert(zoneNotifyRes.json?.shippingFee === 45, 'Lusaka Local shipping fee correctly calculated as K45');
    assert(zoneNotifyRes.json?.totalAmount === 245, 'Grand total correctly verified as K245 (200 + 45)');
    assert(zoneNotifyRes.json?.city === 'Lusaka', 'Order persists courier City: "Lusaka"');
    assert(zoneNotifyRes.json?.landmarkAddress === 'Woodlands, near Crossroads Mall', 'Order persists courier Landmark');
    assert(zoneNotifyRes.json?.customerPhone === '0971234567', 'Order persists courier WhatsApp Phone');

    // 4.7c: Intercity Courier Zone Calculation (K80) via Checkout
    const intercityCheckoutRes = await request(`${testBaseUrl}/api/checkout/initiate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: {
        deliveryZone: 'intercity',
        subtotal: 250,
        city: 'Ndola',
        landmarkAddress: 'Broadway, near Kansenshi',
        customerPhone: '0969998877',
        items: [{ title: 'Handmade Bag', quantity: 1, priceZMW: 250, shopName: 'AfriBay Store' }]
      }
    });
    assert(intercityCheckoutRes.statusCode === 200, 'POST /api/checkout/initiate for Intercity Courier responds 200 OK');
    assert(intercityCheckoutRes.json?.deliveryZone === 'intercity', 'Checkout persists deliveryZone: "intercity"');
    assert(intercityCheckoutRes.json?.shippingFee === 80, 'Intercity Courier shipping fee correctly calculated as K80');
    assert(intercityCheckoutRes.json?.amountZMW === 330, 'Grand total correctly verified as K330 (250 + 80)');
    assert(intercityCheckoutRes.json?.city === 'Ndola', 'Checkout persists destination city: "Ndola"');

    // 4.7d: Free Delivery Automatically Applied for Orders >= K500
    const freeDeliveryRes = await request(`${testBaseUrl}/api/checkout/initiate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: {
        deliveryZone: 'lusaka_local',
        subtotal: 550,
        city: 'Lusaka',
        landmarkAddress: 'Plot 12, Rhodes Park',
        items: [{ title: 'Premium Suit', quantity: 1, priceZMW: 550, shopName: 'AfriBay Store' }]
      }
    });
    assert(freeDeliveryRes.statusCode === 200, 'POST /api/checkout/initiate for K500+ order responds 200 OK');
    assert(freeDeliveryRes.json?.shippingFee === 0, 'Free delivery automatically applied (shipping fee = K0)');
    assert(freeDeliveryRes.json?.amountZMW === 550, 'Grand total correctly verified as K550 (subtotal only, zero shipping)');

    // 4.7e: Self Pickup Option (K0)
    const pickupDeliveryRes = await request(`${testBaseUrl}/api/checkout/initiate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: {
        deliveryZone: 'pickup',
        subtotal: 150,
        items: [{ title: 'Sneakers', quantity: 1, priceZMW: 150, shopName: 'AfriBay Store' }]
      }
    });
    assert(pickupDeliveryRes.statusCode === 200, 'POST /api/checkout/initiate for pickup responds 200 OK');
    assert(pickupDeliveryRes.json?.shippingFee === 0, 'Self pickup shipping fee is K0');
    assert(pickupDeliveryRes.json?.amountZMW === 150, 'Grand total for pickup equals subtotal K150');

    // 4.8 PawaPay Webhook Tests (POST /api/webhooks/pawapay)
    // 4.8a: Reject invalid payload missing depositId or status
    const invalidWebhookRes = await request(`${testBaseUrl}/api/webhooks/pawapay`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: { depositId: '' },
    });
    assert(invalidWebhookRes.statusCode === 400, 'POST /api/webhooks/pawapay rejects missing depositId/status with 400');

    // 4.8b: Valid COMPLETED status updates existing order to Processing / Paid
    const validWebhookRes = await request(`${testBaseUrl}/api/webhooks/pawapay`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: {
        depositId: 'DEP-PAWAPAY-12345',
        status: 'COMPLETED',
        reference: trackingId,
        currency: 'ZMW',
        amount: '485.00'
      },
    });
    assert(validWebhookRes.statusCode === 200, 'POST /api/webhooks/pawapay responds 200 OK for COMPLETED deposit');
    assert(validWebhookRes.json?.status === 'Processing', 'Order status mapped to Processing on COMPLETED');
    assert(validWebhookRes.json?.paymentStatus === 'Paid', 'Payment status mapped to Paid on COMPLETED');

    // 4.8c: FAILED/REJECTED status updates order to Payment_Failed / Failed
    const failedWebhookRes = await request(`${testBaseUrl}/api/webhooks/pawapay`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: {
        depositId: 'DEP-PAWAPAY-67890',
        status: 'FAILED',
        reference: trackingId,
      },
    });
    assert(failedWebhookRes.statusCode === 200, 'POST /api/webhooks/pawapay responds 200 OK for FAILED deposit');
    assert(failedWebhookRes.json?.status === 'Payment_Failed', 'Order status mapped to Payment_Failed on FAILED');
    assert(failedWebhookRes.json?.paymentStatus === 'Failed', 'Payment status mapped to Failed on FAILED');

    // 4.8d: Orphaned reference responds 200 with warning so PawaPay does not retry endlessly
    const orphanWebhookRes = await request(`${testBaseUrl}/api/webhooks/pawapay`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: {
        depositId: 'DEP-PAWAPAY-99999',
        status: 'COMPLETED',
        reference: 'NON-EXISTENT-ORDER-ID',
      },
    });
    assert(orphanWebhookRes.statusCode === 200 && orphanWebhookRes.json?.warning === 'Order not found', 'POST /api/webhooks/pawapay returns 200 with warning for non-existent reference');

    // 4.9 PawaPay Checkout Deposit Initiation Tests (POST /api/checkout)
    // 4.9a: Parameter validation
    const invalidCheckoutRes = await request(`${testBaseUrl}/api/checkout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: { amount: 100 },
    });
    assert(invalidCheckoutRes.statusCode === 400, 'POST /api/checkout rejects missing parameters with 400');

    // 4.9b: Live PawaPay sandbox deposit initiation
    const liveDepositRes = await request(`${testBaseUrl}/api/checkout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: {
        phoneNumber: '0971234567',
        amount: '15.50',
        orderId: trackingId,
        network: 'mtn'
      },
    });
    assert(liveDepositRes.statusCode === 200, 'POST /api/checkout responds 200 OK');
    assert(liveDepositRes.json?.success === true, 'PawaPay checkout returns success: true');
    assert(liveDepositRes.json?.depositId?.length === 36, 'PawaPay returns valid 36-character UUID depositId');
    assert(liveDepositRes.json?.status === 'ACCEPTED', `PawaPay sandbox deposit status is ACCEPTED (received: ${liveDepositRes.json?.status})`);

    // 4.10 Vendor Shop Setup & Subscription System Tests
    // 4.10a: Create Shop requires MTN and Airtel mobile money lines
    const invalidShopRes = await request(`${testBaseUrl}/api/shops`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: { shopName: 'Test Shop Without Phones' },
    });
    assert(invalidShopRes.statusCode === 400, 'POST /api/shops rejects missing MTN/Airtel phone numbers with 400');

    // 4.10b: Successfully create shop with MTN, Airtel, and payout preference
    const validShopPayload = {
      userId: 'vendor-123',
      shopName: 'Zed Quality Thrift',
      mtnPhone: '0760312951',
      airtelPhone: '0778085670',
      payoutPreference: 'mobile_money',
      description: 'Authentic items in Lusaka'
    };
    const validShopRes = await request(`${testBaseUrl}/api/shops`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: validShopPayload,
    });
    assert(validShopRes.statusCode === 201, 'POST /api/shops creates shop with 201 Created');
    assert(validShopRes.json?.subscriptionStatus === 'trial', 'New shop starts with subscriptionStatus: "trial"');
    assert(validShopRes.json?.daysLeft === 5, 'New shop is allocated 5-day free trial');
    assert(validShopRes.json?.mtnPhone === '0760312951', 'Shop persists MTN phone line');
    assert(validShopRes.json?.airtelPhone === '0778085670', 'Shop persists Airtel phone line');

    const testShopId = validShopRes.json.id;

    // 4.10c: Check Subscription Status endpoint
    const subStatusRes = await request(`${testBaseUrl}/api/vendor/subscription/status?shopId=${testShopId}`);
    assert(subStatusRes.statusCode === 200, 'GET /api/vendor/subscription/status responds 200 OK');
    assert(subStatusRes.json?.status === 'trial' && subStatusRes.json?.canList === true, 'Vendor can list products during active trial');
    assert(subStatusRes.json?.paymentLines?.mtn === '0760312951', 'Subscription returns official MTN destination: 0760312951');
    assert(subStatusRes.json?.paymentLines?.airtel === '0778085670', 'Subscription returns official Airtel destination: 0778085670');

    // 4.10d: Create Product during active trial
    const prodRes = await request(`${testBaseUrl}/api/products`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: {
        shopId: testShopId,
        title: 'Handmade Kitenge Bag',
        priceZMW: 250,
        category: 'new_goods',
        condition: 'new'
      }
    });
    assert(prodRes.statusCode === 201, 'POST /api/products succeeds during 5-day free trial');

    // 4.10e: Lock product creation when trial expires
    // Simulate expired shop
    const expiredShopRes = await request(`${testBaseUrl}/api/shops`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: {
        userId: 'vendor-expired',
        shopName: 'Expired Shop',
        mtnPhone: '0960000000',
        airtelPhone: '0970000000',
        payoutPreference: 'cash',
        trialEndsAt: Date.now() - 1000 // already expired
      }
    });
    const expiredShopId = expiredShopRes.json.id;

    const blockedProdRes = await request(`${testBaseUrl}/api/products`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: {
        shopId: expiredShopId,
        title: 'Locked Product',
        priceZMW: 100
      }
    });
    assert(blockedProdRes.statusCode === 403, 'POST /api/products returns 403 Forbidden when trial is expired');
    assert(blockedProdRes.json?.paymentLines?.mtn === '0760312951', 'Error response returns official subscription payment instructions');

    // 4.10f: Activate subscription (K20/weekly or K100/monthly) to unlock shop
    const activateSubRes = await request(`${testBaseUrl}/api/vendor/subscription/activate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: {
        shopId: expiredShopId,
        tier: 'weekly',
        transactionRef: 'MP260101-MOMOTEST'
      }
    });
    assert(activateSubRes.statusCode === 200, 'POST /api/vendor/subscription/activate responds 200 OK');
    assert(activateSubRes.json?.shop?.subscriptionStatus === 'active', 'Shop subscriptionStatus updated to "active"');
    assert(activateSubRes.json?.daysLeft === 7, 'Weekly tier adds 7 active days');

    // Verify unlocked product creation after activation
    const unblockedProdRes = await request(`${testBaseUrl}/api/products`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: {
        shopId: expiredShopId,
        title: 'Now Unlocked Product',
        priceZMW: 100
      }
    });
    assert(unblockedProdRes.statusCode === 201, 'POST /api/products succeeds once subscription is activated');

    // 4.11: Test Delete Product feature
    const createdProductId = unblockedProdRes.json?.product?.id;
    assert(Boolean(createdProductId), 'Unblocked product has valid ID');
    const deleteProdRes = await request(`${testBaseUrl}/api/products/${encodeURIComponent(createdProductId)}`, {
      method: 'DELETE'
    });
    assert(deleteProdRes.statusCode === 200, 'DELETE /api/products/:id succeeds with 200 OK');
    assert(deleteProdRes.json?.success === true, 'DELETE /api/products returns success: true');

    // 4.12: Test Delete Shop feature (and associated products)
    const deleteShopRes = await request(`${testBaseUrl}/api/shops/${encodeURIComponent(expiredShopId)}`, {
      method: 'DELETE'
    });
    assert(deleteShopRes.statusCode === 200, 'DELETE /api/shops/:id succeeds with 200 OK');
    assert(deleteShopRes.json?.success === true, 'DELETE /api/shops returns success: true');

    // 4.13: Test Customer Report: Product not arrived in > 2 days
    const reportDelayRes = await request(`${testBaseUrl}/api/orders/report-delay`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: {
        trackingId: 'AFB-TEST-DELAY-01',
        buyerPhone: '0971234567',
        reason: 'Product has not arrived in more than two days'
      }
    });
    assert(reportDelayRes.statusCode === 200, 'POST /api/orders/report-delay responds 200 OK');
    assert(reportDelayRes.json?.success === true, 'POST /api/orders/report-delay returns success: true');
    assert(reportDelayRes.json?.status === 'under_investigation', 'Reported order status is under_investigation');

    // 4.14: Test Customer Message / Inquiry routing directly to store owner email
    const messageRes = await request(`${testBaseUrl}/api/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: {
        name: 'Chileshe Mulenga',
        email: 'chileshe@example.com',
        phone: '0978889999',
        subject: 'Handmade Kitenge Bag Inquiry',
        message: 'Hello, is this item available for delivery in Woodlands today?'
      }
    });
    assert(messageRes.statusCode === 200, 'POST /api/messages responds 200 OK');
    assert(messageRes.json?.success === true, 'POST /api/messages returns success: true');
    assert(messageRes.json?.recipient === 'luyandokandisha@gmail.com', 'Customer message delivered to store owner email luyandokandisha@gmail.com');
  } catch (err) {
    console.error('API Test Error:', err);
    assert(false, `API tests threw exception: ${err.message}`);
  }

  // ----------------------------------------------------
  // TEST SUMMARY
  // ----------------------------------------------------
  console.log('\n====================================================');
  console.log(`TEST SUMMARY: ${testsPassed} PASSED, ${testsFailed} FAILED`);
  console.log('====================================================\n');

  if (server) {
    if (server.closeAllConnections) server.closeAllConnections();
    server.close();
  }
  setTimeout(() => {
    process.exit(testsFailed > 0 ? 1 : 0);
  }, 100);
}

runTestSuite().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
