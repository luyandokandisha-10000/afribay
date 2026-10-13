# AfriBay GPS Location Picker (Google Maps & Geolocator)

This module provides a production-grade GPS Location Picker for AfriBay's Flutter app, supporting:
1. **Interactive Google Maps Picker with Fixed Center Pin** (Uber/DoorDash UX pattern).
2. **Checkout Flow Integration**: Captures `delivery_lat` and `delivery_lng` for courier logistics dispatch (DropSync/oDeliver) and driver routing.
3. **Vendor Shop Onboarding Integration**: Captures `shop_lat` and `shop_lng` for physical market stands/shops and persists them in Firestore.

---

## 1. Dependencies

Add the following to your `pubspec.yaml`:

```yaml
dependencies:
  flutter:
    sdk: flutter
  google_maps_flutter: ^2.5.3
  geolocator: ^10.1.0
  geocoding: ^2.1.1
  http: ^1.2.0
  cloud_firestore: ^4.17.5
  firebase_auth: ^4.19.7
```

Run:
```bash
flutter pub get
```

---

## 2. Platform Permissions Setup

### Android (`android/app/src/main/AndroidManifest.xml`)
Add the location permissions and your Google Maps API key inside `<manifest>`:

```xml
<uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />
<uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION" />
<uses-permission android:name="android.permission.INTERNET" />

<application ...>
    <!-- Replace with your actual Google Maps API key from Google Cloud Console -->
    <meta-data
        android:name="com.google.android.geo.API_KEY"
        android:value="YOUR_GOOGLE_MAPS_API_KEY_HERE" />
</application>
```

### iOS (`ios/Runner/Info.plist`)
Add location permission descriptions:

```xml
<key>NSLocationWhenInUseUsageDescription</key>
<string>AfriBay needs access to your GPS location to pin your exact delivery doorstep or physical market stand.</string>
<key>NSLocationAlwaysAndWhenInUseUsageDescription</key>
<string>AfriBay uses your location to route couriers and delivery riders to your delivery drop-off point.</string>
```

---

## 3. How to Launch the Location Picker

The `LocationPickerScreen` provides a one-line static launcher:

```dart
import 'package:afribay/widgets/location_picker_screen.dart';
import 'package:afribay/models/location_result.dart';

// Launch the picker modal/screen
final LocationResult? result = await LocationPickerScreen.pickLocation(
  context,
  title: 'Pin Delivery Drop-off Point',
  confirmButtonText: 'Confirm Drop-off Pin',
);

if (result != null) {
  print('Selected Latitude: ${result.latitude}');
  print('Selected Longitude: ${result.longitude}');
  print('Google Maps Link: ${result.toGoogleMapsUrl()}');
}
```

### Features Included:
- **Automatic GPS Lock**: Queries user's current GPS position via `geolocator` on mount (falls back to Lusaka Central `-15.3875, 28.3228` if permissions denied).
- **Fixed Center Pin (`Stack` + `Center`)**: Captures coordinates dynamically during map dragging/zooming with `onCameraMove`.
- **"Use Current Location" FAB**: Instantly re-queries GPS and smoothly animates the camera back to the user's live position.
- **Top Coordinate Readout**: Displays live formatted coordinates (`Lat: ..., Lng: ...`).
- **"Confirm Pin Location" Button**: Returns a strongly-typed `LocationResult`.

---

## 4. State & Checkout Integration

In `lib/screens/checkout_screen.dart`:
```dart
final orderPayload = {
  'trackingId': trackingId,
  'customer': {
    'email': userEmail,
    'name': userName,
    'phone': phoneController.text.trim(),
  },
  'items': cartItems,
  'totalZMW': totalZMW,
  'deliveryAddress': addressController.text.trim(),
  
  // Exact GPS Coordinates for Courier Dispatch
  'delivery_lat': pickedLocation?.latitude,
  'delivery_lng': pickedLocation?.longitude,

  // Escrow Lifecycle
  'paymentMethod': 'mobile_money_mtn',
  'paymentPhone': phoneController.text.trim(),
  'deliveryPin': deliveryPin,
  'escrowStatus': 'escrow_held',
  'payoutStatus': 'held_in_escrow',
};
```

---

## 5. Vendor Shop Setup Integration

In `lib/screens/shop_setup_screen.dart`:
```dart
await FirebaseFirestore.instance.collection('shops').add({
  'userId': uid,
  'shopName': shopNameController.text.trim(),
  'contactPhone': phoneController.text.trim(),
  'physicalAddress': addressController.text.trim(),
  'description': descController.text.trim(),
  
  // Stand Coordinates
  'shop_lat': pinnedShopLocation?.latitude,
  'shop_lng': pinnedShopLocation?.longitude,
  
  'status': 'active',
  'createdAt': FieldValue.serverTimestamp(),
});
```

---

## 6. Backend Logistics & Courier Routing (Node.js)

The order payload received by `POST /api/checkout/initiate` and `POST /api/orders/notify`:
- Extracts `delivery_lat` and `delivery_lng`.
- Generates `courierMapsUrl`: `https://www.google.com/maps?q=${delivery_lat},${delivery_lng}`.
- Formats email notifications to `luyandokandisha@gmail.com` with direct Google Maps navigation links for the delivery rider.
- Dispatches coordinates to third-party couriers (DropSync / oDeliver) for rider navigation.
