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
    'shopName', 'shopPhone', 'shopAddressInput', 'shopLat', 'shopLng', 'shopGpsLabel', 'shopSubmitBtn', 'shopError',
    'deliveryTabGps', 'deliveryTabAddress', 'deliveryGpsSection', 'deliveryAddressSection',
    'deliveryAddress', 'deliveryLat', 'deliveryLng', 'deliveryGpsLabel', 'checkoutTotal', 'checkoutError',
    'receiptTracking', 'receiptAmount', 'receiptPin', 'receiptGpsInfo', 'receiptMapsLink', 'receiptEscrowBadge',
    'cartList', 'subtotal', 'delivery', 'total',
    'sellerProducts', 'sellerViews', 'sellerProductCount', 'sellerAdCount',
    'sellerAvailablePayout', 'sellerEscrowHeld', 'sellerOrdersCount', 'sellerFulfillmentList'
  ];

  for (const id of requiredElementIds) {
    const hasElement = indexHtml.includes(`id="${id}"`);
    assert(hasElement, `DOM element id="${id}" exists in HTML`);
  }

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
