class LocationResult {
  final double latitude;
  final double longitude;
  final String? address;

  const LocationResult({
    required this.latitude,
    required this.longitude,
    this.address,
  });

  Map<String, dynamic> toMap() {
    return {
      'latitude': latitude,
      'longitude': longitude,
      'address': address,
    };
  }

  factory LocationResult.fromMap(Map<String, dynamic> map) {
    return LocationResult(
      latitude: (map['latitude'] as num).toDouble(),
      longitude: (map['longitude'] as num).toDouble(),
      address: map['address'] as String?,
    );
  }

  /// Direct Google Maps web/navigation link for delivery drivers
  String toGoogleMapsUrl() {
    return 'https://www.google.com/maps?q=$latitude,$longitude';
  }

  @override
  String toString() {
    return 'LocationResult(latitude: $latitude, longitude: $longitude, address: $address)';
  }
}
