import 'package:flutter/material.dart';

import 'event_detail_screen.dart';

/// Kept for backward-compatible deep links; bracket lives in [EventDetailScreen] tab 0.
class BracketScreen extends StatelessWidget {
  const BracketScreen({super.key, required this.eventId});

  final String eventId;

  @override
  Widget build(BuildContext context) {
    return EventDetailScreen(eventId: eventId, initialTab: 0);
  }
}
