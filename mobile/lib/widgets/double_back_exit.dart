import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

/// Wraps a top-level navigation hub so the Android system back gesture/button
/// does not immediately quit the app. The first back shows a hint; a second
/// back within [window] exits the app.
class DoubleBackToExit extends StatefulWidget {
  const DoubleBackToExit({super.key, required this.child});

  final Widget child;

  @override
  State<DoubleBackToExit> createState() => _DoubleBackToExitState();
}

class _DoubleBackToExitState extends State<DoubleBackToExit> {
  static const Duration window = Duration(seconds: 2);
  DateTime? _lastBack;

  void _handleBack() {
    final now = DateTime.now();
    if (_lastBack == null || now.difference(_lastBack!) > window) {
      _lastBack = now;
      ScaffoldMessenger.of(context)
        ..clearSnackBars()
        ..showSnackBar(
          const SnackBar(
            content: Text('Press back again to exit'),
            duration: window,
            behavior: SnackBarBehavior.floating,
          ),
        );
    } else {
      ScaffoldMessenger.of(context).clearSnackBars();
      SystemNavigator.pop();
    }
  }

  @override
  Widget build(BuildContext context) {
    return PopScope(
      canPop: false,
      onPopInvokedWithResult: (didPop, result) {
        if (didPop) return;
        _handleBack();
      },
      child: widget.child,
    );
  }
}
