import 'package:flutter/material.dart';
import 'package:google_maps_flutter/google_maps_flutter.dart';
import 'package:geolocator/geolocator.dart';
import '../models/location_result.dart';
import '../services/location_service.dart';

class LocationPickerScreen extends StatefulWidget {
  final LatLng? initialLocation;
  final String title;
  final String confirmButtonText;

  const LocationPickerScreen({
    Key? key,
    this.initialLocation,
    this.title = 'Pin Exact Location',
    this.confirmButtonText = 'Confirm Pin Location',
  }) : super(key: key);

  /// Convenient static helper to launch the picker as a route and await the coordinates
  static Future<LocationResult?> pickLocation(
    BuildContext context, {
    LatLng? initialLocation,
    String title = 'Pin Exact Location',
    String confirmButtonText = 'Confirm Pin Location',
  }) {
    return Navigator.push<LocationResult>(
      context,
      MaterialPageRoute(
        builder: (context) => LocationPickerScreen(
          initialLocation: initialLocation,
          title: title,
          confirmButtonText: confirmButtonText,
        ),
      ),
    );
  }

  @override
  State<LocationPickerScreen> createState() => _LocationPickerScreenState();
}

class _LocationPickerScreenState extends State<LocationPickerScreen> {
  GoogleMapController? _mapController;
  late LatLng _currentCenter;
  bool _isLoadingInitial = true;
  bool _isMoving = false;

  @override
  void initState() {
    super.initState();
    _currentCenter = widget.initialLocation ?? LocationService.defaultLusakaCenter;
    _initUserLocation();
  }

  Future<void> _initUserLocation() async {
    if (widget.initialLocation != null) {
      setState(() {
        _isLoadingInitial = false;
      });
      return;
    }

    try {
      final Position? pos = await LocationService.getCurrentPosition();
      if (pos != null && mounted) {
        final newCenter = LatLng(pos.latitude, pos.longitude);
        setState(() {
          _currentCenter = newCenter;
          _isLoadingInitial = false;
        });
        _mapController?.animateCamera(
          CameraUpdate.newLatLngZoom(newCenter, 16.5),
        );
        return;
      }
    } catch (e) {
      debugPrint('[AfriBay Maps] Could not fetch GPS location: $e');
    }

    if (mounted) {
      setState(() {
        _isLoadingInitial = false;
      });
    }
  }

  Future<void> _recenterOnUser() async {
    final scaffoldMessenger = ScaffoldMessenger.of(context);
    try {
      final Position? pos = await LocationService.getCurrentPosition();
      if (pos != null) {
        final userLatLng = LatLng(pos.latitude, pos.longitude);
        setState(() {
          _currentCenter = userLatLng;
        });
        _mapController?.animateCamera(
          CameraUpdate.newLatLngZoom(userLatLng, 17.0),
        );
      } else {
        scaffoldMessenger.showSnackBar(
          const SnackBar(
            content: Text('Please enable GPS location permissions in your phone settings.'),
            backgroundColor: Color(0xFFB91C1C),
          ),
        );
      }
    } catch (err) {
      scaffoldMessenger.showSnackBar(
        SnackBar(
          content: Text('Unable to detect current GPS: $err'),
          backgroundColor: const Color(0xFFB91C1C),
        ),
      );
    }
  }

  void _confirmLocation() {
    final result = LocationResult(
      latitude: double.parse(_currentCenter.latitude.toStringAsFixed(6)),
      longitude: double.parse(_currentCenter.longitude.toStringAsFixed(6)),
    );
    Navigator.of(context).pop(result);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text(
          widget.title,
          style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 18),
        ),
        backgroundColor: const Color(0xFF165B33), // AfriBay Zambian Green
        foregroundColor: Colors.white,
        elevation: 1,
      ),
      body: Stack(
        children: [
          // 1. Google Map View
          GoogleMap(
            initialCameraPosition: CameraPosition(
              target: _currentCenter,
              zoom: 15.5,
            ),
            myLocationEnabled: true,
            myLocationButtonEnabled: false,
            zoomControlsEnabled: false,
            compassEnabled: true,
            onMapCreated: (controller) {
              _mapController = controller;
            },
            onCameraMoveStarted: () {
              if (!_isMoving) {
                setState(() => _isMoving = true);
              }
            },
            onCameraMove: (CameraPosition position) {
              // Dynamically capture map center coordinates
              _currentCenter = position.target;
            },
            onCameraIdle: () {
              if (_isMoving) {
                setState(() => _isMoving = false);
              }
            },
          ),

          // 2. Fixed Center Pin / Marker (Uber/DoorDash UX pattern)
          Center(
            child: Padding(
              // Negative bottom padding to lift the pin point directly onto the target coordinate
              padding: const EdgeInsets.only(bottom: 40.0),
              child: AnimatedScale(
                scale: _isMoving ? 1.15 : 1.0,
                duration: const Duration(milliseconds: 150),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                      decoration: BoxDecoration(
                        color: Colors.black.withOpacity(0.85),
                        borderRadius: BorderRadius.circular(16),
                        boxShadow: const [
                          BoxShadow(color: Colors.black26, blurRadius: 4, offset: Offset(0, 2)),
                        ],
                      ),
                      child: Text(
                        _isMoving ? 'Move map to target' : 'Pin Target',
                        style: const TextStyle(
                          color: Colors.white,
                          fontSize: 11,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ),
                    const SizedBox(height: 4),
                    const Icon(
                      Icons.location_on,
                      size: 46,
                      color: Color(0xFFE53935), // AfriBay Marker Red
                    ),
                    Container(
                      width: 8,
                      height: 4,
                      decoration: BoxDecoration(
                        color: Colors.black38,
                        borderRadius: BorderRadius.circular(4),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),

          // 3. Top Coordinates Info Card
          Positioned(
            top: 16,
            left: 16,
            right: 16,
            child: Card(
              elevation: 4,
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
              color: Colors.white.withOpacity(0.95),
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                child: Row(
                  children: [
                    const Icon(Icons.my_location, color: Color(0xFF165B33), size: 22),
                    const SizedBox(width: 10),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          const Text(
                            'GPS Coordinates',
                            style: TextStyle(fontSize: 11, color: Colors.grey, fontWeight: FontWeight.bold),
                          ),
                          Text(
                            '${_currentCenter.latitude.toStringAsFixed(5)}, ${_currentCenter.longitude.toStringAsFixed(5)}',
                            style: const TextStyle(
                              fontSize: 14,
                              fontWeight: FontWeight.w700,
                              color: Color(0xFF1F2937),
                            ),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),

          // 4. Loading indicator during first GPS lock
          if (_isLoadingInitial)
            Container(
              color: Colors.white.withOpacity(0.7),
              child: const Center(
                child: CircularProgressIndicator(
                  valueColor: AlwaysStoppedAnimation<Color>(Color(0xFF165B33)),
                ),
              ),
            ),

          // 5. Bottom Action Controls
          Positioned(
            left: 16,
            right: 16,
            bottom: 24,
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                // "Use Current Location" Floating Action Button
                FloatingActionButton.extended(
                  heroTag: 'recenter_gps_fab',
                  onPressed: _recenterOnUser,
                  backgroundColor: Colors.white,
                  foregroundColor: const Color(0xFF165B33),
                  elevation: 4,
                  icon: const Icon(Icons.gps_fixed),
                  label: const Text(
                    'Use Current Location',
                    style: TextStyle(fontWeight: FontWeight.w700),
                  ),
                ),
                const SizedBox(height: 14),

                // "Confirm Pin Location" Primary Button
                SizedBox(
                  width: double.infinity,
                  height: 52,
                  child: ElevatedButton(
                    onPressed: _confirmLocation,
                    style: ElevatedButton.styleFrom(
                      backgroundColor: const Color(0xFF165B33),
                      foregroundColor: Colors.white,
                      elevation: 4,
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(12),
                      ),
                    ),
                    child: Row(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        const Icon(Icons.check_circle_outline, size: 22),
                        const SizedBox(width: 8),
                        Text(
                          widget.confirmButtonText,
                          style: const TextStyle(
                            fontSize: 16,
                            fontWeight: FontWeight.bold,
                            letterSpacing: 0.3,
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
