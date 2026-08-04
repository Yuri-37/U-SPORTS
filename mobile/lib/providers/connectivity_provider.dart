import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

/// True once the device has an active network interface (wifi/cellular/etc).
/// This reflects OS-level connectivity, not whether that network actually
/// reaches the internet — good enough for "you're offline" messaging, and
/// avoids the latency/complexity of an actual reachability probe.
final isOnlineProvider = StreamProvider<bool>((ref) async* {
  final connectivity = Connectivity();
  yield _isOnline(await connectivity.checkConnectivity());
  yield* connectivity.onConnectivityChanged.map(_isOnline);
});

bool _isOnline(List<ConnectivityResult> results) =>
    results.any((r) => r != ConnectivityResult.none);
