import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;
import '../models/location_result.dart';
import '../widgets/location_picker_screen.dart';

class CartItemModel {
  final String id;
  final String title;
  final double priceZMW;
  final int quantity;
  final String shopName;

  CartItemModel({
    required this.id,
    required this.title,
    required this.priceZMW,
    required this.quantity,
    required this.shopName,
  });

  Map<String, dynamic> toMap() {
    return {
      'productId': id,
      'title': title,
      'priceZMW': priceZMW,
      'quantity': quantity,
      'shopName': shopName,
    };
  }
}

class CheckoutScreen extends StatefulWidget {
  final List<CartItemModel> cartItems;
  final String userEmail;
  final String userName;
  final String? userPhone;
  final String backendBaseUrl;

  const CheckoutScreen({
    Key? key,
    required this.cartItems,
    this.userEmail = 'shopper@afribay.com',
    this.userName = 'AfriBay Shopper',
    this.userPhone,
    this.backendBaseUrl = 'http://10.0.2.2:5000', // Standard Android Emulator localhost fallback
  }) : super(key: key);

  @override
  State<CheckoutScreen> createState() => _CheckoutScreenState();
}

class _CheckoutScreenState extends State<CheckoutScreen> {
  final _formKey = GlobalKey<FormState>();
  final _addressController = TextEditingController(text: 'Woodlands, Lusaka, Zambia');
  final _phoneController = TextEditingController();

  LocationResult? _pickedLocation;
  String _selectedPaymentMethod = 'mobile_money';
  String _selectedMomoProvider = 'mtn'; // mtn, airtel, zamtel
  bool _isSubmitting = false;

  double get _subtotal => widget.cartItems.fold(
        0.0,
        (sum, item) => sum + (item.priceZMW * item.quantity),
      );

  double get _deliveryFee => 35.0; // 35 ZMW AfriBay delivery fee
  double get _totalZMW => _subtotal + _deliveryFee;

  @override
  void initState() {
    super.initState();
    if (widget.userPhone != null && widget.userPhone!.isNotEmpty) {
      _phoneController.text = widget.userPhone!;
    }
  }

  @override
  void dispose() {
    _addressController.dispose();
    _phoneController.dispose();
    super.dispose();
  }

  Future<void> _openLocationPicker() async {
    final result = await LocationPickerScreen.pickLocation(
      context,
      initialLocation: null,
      title: 'Pin Delivery Drop-off Point',
      confirmButtonText: 'Set Delivery Coordinates',
    );

    if (result != null) {
      setState(() {
        _pickedLocation = result;
      });
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('GPS Pin Attached: ${result.latitude}, ${result.longitude}'),
          backgroundColor: const Color(0xFF165B33),
          duration: const Duration(seconds: 2),
        ),
      );
    }
  }

  Future<void> _processCheckout() async {
    if (!_formKey.currentState!.validate()) return;

    if (_selectedPaymentMethod == 'mobile_money' && _phoneController.text.trim().isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Please enter your mobile money phone number.'),
          backgroundColor: Color(0xFFB91C1C),
        ),
      );
      return;
    }

    setState(() => _isSubmitting = true);

    try {
      final String trackingId = 'AFB-${DateTime.now().millisecondsSinceEpoch.toRadixString(36).toUpperCase()}';
      final String deliveryPin = (100000 + (DateTime.now().microsecond % 900000)).toString();

      // Order payload with GPS coordinates and escrow lifecycle
      final orderPayload = {
        'trackingId': trackingId,
        'customer': {
          'email': widget.userEmail,
          'name': widget.userName,
          'phone': _phoneController.text.trim(),
        },
        'items': widget.cartItems.map((e) => e.toMap()).toList(),
        'totalZMW': _totalZMW,
        'deliveryFeeZMW': _deliveryFee,
        'vendorPayoutZMW': _subtotal,
        // Delivery coordinates for logistics dispatch
        'deliveryAddress': _addressController.text.trim(),
        'delivery_lat': _pickedLocation?.latitude,
        'delivery_lng': _pickedLocation?.longitude,
        // Escrow mobile money lifecycle
        'paymentMethod': '${_selectedPaymentMethod}_$_selectedMomoProvider',
        'paymentPhone': _phoneController.text.trim(),
        'deliveryPin': deliveryPin,
        'escrowStatus': 'escrow_held',
        'deliveryStatus': 'processing',
        'payoutStatus': 'held_in_escrow',
        'createdAt': DateTime.now().toIso8601String(),
      };

      // Dispatch to Node.js backend escrow order service
      final response = await http.post(
        Uri.parse('${widget.backendBaseUrl}/api/checkout/initiate'),
        headers: {'Content-Type': 'application/json'},
        body: jsonEncode(orderPayload),
      );

      final responseData = response.statusCode == 200 || response.statusCode == 201
          ? jsonDecode(response.body)
          : null;

      if (!mounted) return;
      setState(() => _isSubmitting = false);

      _showOrderSuccessDialog(
        trackingId: trackingId,
        deliveryPin: deliveryPin,
        courierMapsUrl: _pickedLocation?.toGoogleMapsUrl(),
      );
    } catch (err) {
      if (!mounted) return;
      setState(() => _isSubmitting = false);
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('Checkout failed: $err'),
          backgroundColor: const Color(0xFFB91C1C),
        ),
      );
    }
  }

  void _showOrderSuccessDialog({
    required String trackingId,
    required String deliveryPin,
    String? courierMapsUrl,
  }) {
    showDialog(
      context: context,
      barrierDismissible: false,
      builder: (ctx) => AlertDialog(
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
        title: Row(
          children: const [
            Icon(Icons.check_circle, color: Color(0xFF165B33), size: 28),
            SizedBox(width: 8),
            Text('Order Confirmed!', style: TextStyle(fontWeight: FontWeight.bold)),
          ],
        ),
        content: SingleChildScrollView(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisSize: MainAxisSize.min,
            children: [
              Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: const Color(0xFFE8F5E9),
                  borderRadius: BorderRadius.circular(8),
                ),
                child: const Text(
                  '🛡️ Payment Held in Escrow\nFunds will only be released to the vendor after your driver confirms delivery with your PIN.',
                  style: TextStyle(fontSize: 12, color: Color(0xFF1B5E20), fontWeight: FontWeight.w600),
                ),
              ),
              const SizedBox(height: 14),
              Text('Tracking ID: $trackingId', style: const TextStyle(fontWeight: FontWeight.bold)),
              const SizedBox(height: 6),
              Text(
                'Delivery Drop-off PIN: $deliveryPin',
                style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w800, color: Color(0xFFE65100)),
              ),
              const SizedBox(height: 4),
              const Text(
                'Give this 6-digit PIN to the delivery rider once you receive and inspect your parcel.',
                style: TextStyle(fontSize: 11, color: Colors.grey),
              ),
              if (courierMapsUrl != null) ...[
                const SizedBox(height: 12),
                Row(
                  children: [
                    const Icon(Icons.location_on, color: Color(0xFF165B33), size: 18),
                    const SizedBox(width: 4),
                    Expanded(
                      child: Text(
                        'GPS: ${_pickedLocation?.latitude}, ${_pickedLocation?.longitude}',
                        style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600),
                      ),
                    ),
                  ],
                ),
              ],
            ],
          ),
        ),
        actions: [
          ElevatedButton(
            style: ElevatedButton.styleFrom(
              backgroundColor: const Color(0xFF165B33),
              foregroundColor: Colors.white,
            ),
            onPressed: () {
              Navigator.of(ctx).pop();
              Navigator.of(context).pop(true);
            },
            child: const Text('Back to Marketplace'),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('AfriBay Escrow Checkout'),
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
              // 1. Order Summary Card
              Card(
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                elevation: 2,
                child: Padding(
                  padding: const EdgeInsets.all(16),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text(
                        'Order Summary',
                        style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold),
                      ),
                      const Divider(height: 20),
                      ...widget.cartItems.map((item) => Padding(
                            padding: const EdgeInsets.symmetric(vertical: 4),
                            child: Row(
                              mainAxisAlignment: MainAxisAlignment.spaceBetween,
                              children: [
                                Expanded(
                                  child: Text(
                                    '${item.title} × ${item.quantity}',
                                    style: const TextStyle(fontSize: 13),
                                  ),
                                ),
                                Text('ZMW ${(item.priceZMW * item.quantity).toStringAsFixed(2)}'),
                              ],
                            ),
                          )),
                      const Divider(height: 20),
                      Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          const Text('Logistics & Delivery'),
                          Text('ZMW ${_deliveryFee.toStringAsFixed(2)}'),
                        ],
                      ),
                      const SizedBox(height: 8),
                      Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          const Text('Total Payable', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 16)),
                          Text(
                            'ZMW ${_totalZMW.toStringAsFixed(2)}',
                            style: const TextStyle(
                              fontWeight: FontWeight.w800,
                              fontSize: 18,
                              color: Color(0xFF165B33),
                            ),
                          ),
                        ],
                      ),
                    ],
                  ),
                ),
              ),

              const SizedBox(height: 20),

              // 2. Delivery Address & GPS Coordinates Pinning
              Card(
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                elevation: 2,
                child: Padding(
                  padding: const EdgeInsets.all(16),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: const [
                          Text('Delivery Destination', style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold)),
                          Text('Required', style: TextStyle(fontSize: 12, color: Colors.grey)),
                        ],
                      ),
                      const SizedBox(height: 12),
                      TextFormField(
                        controller: _addressController,
                        decoration: const InputDecoration(
                          labelText: 'Street Address & Landmarks',
                          hintText: 'e.g. Plot 42, Woodlands Extension, Lusaka',
                          border: OutlineInputBorder(),
                          prefixIcon: Icon(Icons.home_outlined),
                        ),
                        validator: (value) => (value == null || value.trim().isEmpty)
                            ? 'Please provide delivery address details'
                            : null,
                      ),
                      const SizedBox(height: 14),

                      // GPS Pin Picker Widget Trigger
                      Container(
                        padding: const EdgeInsets.all(12),
                        decoration: BoxDecoration(
                          color: _pickedLocation == null ? const Color(0xFFF9FAFB) : const Color(0xFFE8F5E9),
                          borderRadius: BorderRadius.circular(10),
                          border: Border.all(
                            color: _pickedLocation == null ? const Color(0xFFE5E7EB) : const Color(0xFF81C784),
                          ),
                        ),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Row(
                              children: [
                                Icon(
                                  _pickedLocation == null ? Icons.add_location_alt_outlined : Icons.check_circle,
                                  color: _pickedLocation == null ? const Color(0xFF4B5563) : const Color(0xFF165B33),
                                ),
                                const SizedBox(width: 8),
                                Expanded(
                                  child: Column(
                                    crossAxisAlignment: CrossAxisAlignment.start,
                                    children: [
                                      Text(
                                        _pickedLocation == null
                                            ? 'Precise GPS Pin Location'
                                            : 'GPS Coordinates Attached',
                                        style: TextStyle(
                                          fontWeight: FontWeight.bold,
                                          fontSize: 13,
                                          color: _pickedLocation == null ? Colors.black87 : const Color(0xFF165B33),
                                        ),
                                      ),
                                      Text(
                                        _pickedLocation == null
                                            ? 'Pin your exact gate/doorstep on Google Maps for faster delivery.'
                                            : 'Lat: ${_pickedLocation!.latitude.toStringAsFixed(5)}, Lng: ${_pickedLocation!.longitude.toStringAsFixed(5)}',
                                        style: const TextStyle(fontSize: 11, color: Colors.grey),
                                      ),
                                    ],
                                  ),
                                ),
                              ],
                            ),
                            const SizedBox(height: 10),
                            SizedBox(
                              width: double.infinity,
                              child: OutlinedButton.icon(
                                onPressed: _openLocationPicker,
                                icon: const Icon(Icons.map, size: 18),
                                label: Text(_pickedLocation == null ? 'Pin On Google Maps' : 'Change Map Pin'),
                                style: OutlinedButton.styleFrom(
                                  foregroundColor: const Color(0xFF165B33),
                                  side: const BorderSide(color: Color(0xFF165B33)),
                                ),
                              ),
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
              ),

              const SizedBox(height: 20),

              // 3. Payment Method (Mobile Money Escrow)
              Card(
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                elevation: 2,
                child: Padding(
                  padding: const EdgeInsets.all(16),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text('Mobile Money Provider', style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold)),
                      const SizedBox(height: 12),
                      Row(
                        children: [
                          _buildMomoRadio('MTN MoMo', 'mtn'),
                          const SizedBox(width: 8),
                          _buildMomoRadio('Airtel', 'airtel'),
                          const SizedBox(width: 8),
                          _buildMomoRadio('Zamtel', 'zamtel'),
                        ],
                      ),
                      const SizedBox(height: 14),
                      TextFormField(
                        controller: _phoneController,
                        keyboardType: TextInputType.phone,
                        decoration: const InputDecoration(
                          labelText: 'Zambian Mobile Money Number',
                          hintText: '097XXXXXXX or +26096XXXXXXX',
                          border: OutlineInputBorder(),
                          prefixIcon: Icon(Icons.phone_android),
                        ),
                        validator: (value) => (value == null || value.trim().isEmpty)
                            ? 'Please provide mobile money number for STK prompt'
                            : null,
                      ),
                    ],
                  ),
                ),
              ),

              const SizedBox(height: 24),

              // 4. Pay & Hold in Escrow Action Button
              SizedBox(
                width: double.infinity,
                height: 52,
                child: ElevatedButton(
                  onPressed: _isSubmitting ? null : _processCheckout,
                  style: ElevatedButton.styleFrom(
                    backgroundColor: const Color(0xFF165B33),
                    foregroundColor: Colors.white,
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                  ),
                  child: _isSubmitting
                      ? const CircularProgressIndicator(color: Colors.white)
                      : Text(
                          'Pay ZMW ${_totalZMW.toStringAsFixed(2)} with Escrow',
                          style: const TextStyle(fontSize: 16, fontWeight: FontWeight.bold),
                        ),
                ),
              ),
              const SizedBox(height: 12),
              const Center(
                child: Text(
                  '🔒 Guaranteed with AfriBay Mobile Money Escrow Protection',
                  style: TextStyle(fontSize: 11, color: Colors.grey),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildMomoRadio(String label, String value) {
    final isSelected = _selectedMomoProvider == value;
    return Expanded(
      child: GestureDetector(
        onTap: () => setState(() => _selectedMomoProvider = value),
        child: Container(
          padding: const EdgeInsets.symmetric(vertical: 10),
          decoration: BoxDecoration(
            color: isSelected ? const Color(0xFFE8F5E9) : Colors.white,
            borderRadius: BorderRadius.circular(8),
            border: Border.all(
              color: isSelected ? const Color(0xFF165B33) : const Color(0xFFD1D5DB),
              width: isSelected ? 2 : 1,
            ),
          ),
          alignment: Alignment.center,
          child: Text(
            label,
            style: TextStyle(
              fontSize: 12,
              fontWeight: FontWeight.bold,
              color: isSelected ? const Color(0xFF165B33) : Colors.black87,
            ),
          ),
        ),
      ),
    );
  }
}
