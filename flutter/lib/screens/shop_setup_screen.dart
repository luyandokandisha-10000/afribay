import 'package:flutter/material.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';
import '../models/location_result.dart';
import '../widgets/location_picker_screen.dart';

class ShopSetupScreen extends StatefulWidget {
  final Map<String, dynamic>? existingShop;

  const ShopSetupScreen({
    Key? key,
    this.existingShop,
  }) : super(key: key);

  @override
  State<ShopSetupScreen> createState() => _ShopSetupScreenState();
}

class _ShopSetupScreenState extends State<ShopSetupScreen> {
  final _formKey = GlobalKey<FormState>();
  final _shopNameController = TextEditingController();
  final _phoneController = TextEditingController();
  final _addressController = TextEditingController();
  final _descController = TextEditingController();

  LocationResult? _pinnedShopLocation;
  bool _isSaving = false;

  @override
  void initState() {
    super.initState();
    if (widget.existingShop != null) {
      _shopNameController.text = widget.existingShop!['shopName'] ?? '';
      _phoneController.text = widget.existingShop!['contactPhone'] ?? '';
      _addressController.text = widget.existingShop!['physicalAddress'] ?? '';
      _descController.text = widget.existingShop!['description'] ?? '';

      final lat = widget.existingShop!['shop_lat'] as num?;
      final lng = widget.existingShop!['shop_lng'] as num?;
      if (lat != null && lng != null) {
        _pinnedShopLocation = LocationResult(
          latitude: lat.toDouble(),
          longitude: lng.toDouble(),
        );
      }
    }
  }

  @override
  void dispose() {
    _shopNameController.dispose();
    _phoneController.dispose();
    _addressController.dispose();
    _descController.dispose();
    super.dispose();
  }

  Future<void> _pinShopLocation() async {
    final result = await LocationPickerScreen.pickLocation(
      context,
      initialLocation: _pinnedShopLocation != null
          ? null // will center or pass LatLng(_pinnedShopLocation!.latitude, _pinnedShopLocation!.longitude)
          : null,
      title: 'Pin Physical Stand / Shop',
      confirmButtonText: 'Confirm Shop GPS Location',
    );

    if (result != null) {
      setState(() {
        _pinnedShopLocation = result;
      });
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('Shop GPS Pinned: ${result.latitude}, ${result.longitude}'),
          backgroundColor: const Color(0xFF165B33),
        ),
      );
    }
  }

  Future<void> _saveShopProfile() async {
    if (!_formKey.currentState!.validate()) return;

    setState(() => _isSaving = true);

    try {
      final user = FirebaseAuth.instance.currentUser;
      final uid = user?.uid ?? 'guest-vendor-${DateTime.now().millisecondsSinceEpoch}';

      final shopData = {
        'userId': uid,
        'shopName': _shopNameController.text.trim(),
        'contactPhone': _phoneController.text.trim(),
        'physicalAddress': _addressController.text.trim(),
        'description': _descController.text.trim(),
        // GPS Coordinates pinned by vendor
        'shop_lat': _pinnedShopLocation?.latitude,
        'shop_lng': _pinnedShopLocation?.longitude,
        'status': 'active',
        'updatedAt': FieldValue.serverTimestamp(),
      };

      if (widget.existingShop != null && widget.existingShop!['id'] != null) {
        // Update existing shop
        await FirebaseFirestore.instance
            .collection('shops')
            .doc(widget.existingShop!['id'])
            .update(shopData);
      } else {
        // Create new shop profile
        shopData['createdAt'] = FieldValue.serverTimestamp();
        await FirebaseFirestore.instance.collection('shops').add(shopData);
      }

      if (!mounted) return;
      setState(() => _isSaving = false);

      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Shop profile & GPS coordinates saved successfully!'),
          backgroundColor: Color(0xFF165B33),
        ),
      );

      Navigator.of(context).pop(true);
    } catch (err) {
      if (!mounted) return;
      setState(() => _isSaving = false);

      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('Error saving shop profile: $err'),
          backgroundColor: const Color(0xFFB91C1C),
        ),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text(widget.existingShop == null ? 'Set Up Vendor Shop' : 'Edit Shop Profile'),
        backgroundColor: const Color(0xFF165B33),
        foregroundColor: Colors.white,
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(16),
        child: Form(
          key: _formKey,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text(
                'Vendor Physical Profile & Onboarding',
                style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold, color: Color(0xFF1F2937)),
              ),
              const SizedBox(height: 4),
              const Text(
                'Help delivery riders, couriers, and buyers locate your store or market stand precisely.',
                style: TextStyle(fontSize: 12, color: Colors.grey),
              ),
              const SizedBox(height: 20),

              // Shop Name
              TextFormField(
                controller: _shopNameController,
                decoration: const InputDecoration(
                  labelText: 'Shop / Brand Name *',
                  hintText: 'e.g. Lusaka Thrift Hub, Mimi’s Boutique',
                  border: OutlineInputBorder(),
                  prefixIcon: Icon(Icons.storefront_outlined),
                ),
                validator: (val) => (val == null || val.trim().isEmpty) ? 'Please enter a shop name' : null,
              ),
              const SizedBox(height: 14),

              // Contact Phone
              TextFormField(
                controller: _phoneController,
                keyboardType: TextInputType.phone,
                decoration: const InputDecoration(
                  labelText: 'Contact Phone Number *',
                  hintText: '+260 97... or 096...',
                  border: OutlineInputBorder(),
                  prefixIcon: Icon(Icons.phone_outlined),
                ),
                validator: (val) => (val == null || val.trim().isEmpty) ? 'Please enter a contact number' : null,
              ),
              const SizedBox(height: 14),

              // Physical Stand / Address
              TextFormField(
                controller: _addressController,
                decoration: const InputDecoration(
                  labelText: 'Physical Stand / Location Details',
                  hintText: 'e.g. Soweto Market Stand B-12, or Cairo Road Shop 4',
                  border: OutlineInputBorder(),
                  prefixIcon: Icon(Icons.location_city_outlined),
                ),
              ),
              const SizedBox(height: 14),

              // Description
              TextFormField(
                controller: _descController,
                maxLines: 3,
                decoration: const InputDecoration(
                  labelText: 'Shop Description',
                  hintText: 'Tell buyers what you sell and your operating hours...',
                  border: OutlineInputBorder(),
                ),
              ),
              const SizedBox(height: 20),

              // GPS Location Picker Box
              Container(
                padding: const EdgeInsets.all(16),
                decoration: BoxDecoration(
                  color: _pinnedShopLocation == null ? const Color(0xFFF9FAFB) : const Color(0xFFE8F5E9),
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(
                    color: _pinnedShopLocation == null ? const Color(0xFFE5E7EB) : const Color(0xFF81C784),
                    width: 1.5,
                  ),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Icon(
                          _pinnedShopLocation == null ? Icons.pin_drop_outlined : Icons.check_circle,
                          color: _pinnedShopLocation == null ? const Color(0xFF4B5563) : const Color(0xFF165B33),
                          size: 26,
                        ),
                        const SizedBox(width: 10),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                _pinnedShopLocation == null
                                    ? 'Pin Physical Shop / Stand on GPS'
                                    : 'Shop GPS Coordinates Pinned',
                                style: TextStyle(
                                  fontWeight: FontWeight.bold,
                                  fontSize: 14,
                                  color: _pinnedShopLocation == null ? Colors.black87 : const Color(0xFF165B33),
                                ),
                              ),
                              Text(
                                _pinnedShopLocation == null
                                    ? 'Allows delivery couriers to route directly to your stand for pickup.'
                                    : 'Lat: ${_pinnedShopLocation!.latitude.toStringAsFixed(6)}, Lng: ${_pinnedShopLocation!.longitude.toStringAsFixed(6)}',
                                style: const TextStyle(fontSize: 12, color: Colors.grey),
                              ),
                            ],
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 12),
                    SizedBox(
                      width: double.infinity,
                      child: ElevatedButton.icon(
                        onPressed: _pinShopLocation,
                        icon: const Icon(Icons.map_outlined),
                        label: Text(_pinnedShopLocation == null ? 'Pin On Google Maps' : 'Update Shop GPS Pin'),
                        style: ElevatedButton.styleFrom(
                          backgroundColor: const Color(0xFF165B33),
                          foregroundColor: Colors.white,
                          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                        ),
                      ),
                    ),
                  ],
                ),
              ),

              const SizedBox(height: 28),

              // Save Shop Profile Button
              SizedBox(
                width: double.infinity,
                height: 50,
                child: ElevatedButton(
                  onPressed: _isSaving ? null : _saveShopProfile,
                  style: ElevatedButton.styleFrom(
                    backgroundColor: const Color(0xFFE65100), // AfriBay Amber/Orange
                    foregroundColor: Colors.white,
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                  ),
                  child: _isSaving
                      ? const CircularProgressIndicator(color: Colors.white)
                      : Text(
                          widget.existingShop == null ? 'Create Shop Profile' : 'Save Changes',
                          style: const TextStyle(fontSize: 16, fontWeight: FontWeight.bold),
                        ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
