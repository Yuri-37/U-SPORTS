import 'package:intl/intl.dart';

String formatEnumLabel(String raw) {
  if (raw.isEmpty) return raw;
  return raw
      .replaceAll('_', ' ')
      .split(' ')
      .map((w) => w.isEmpty ? w : '${w[0].toUpperCase()}${w.substring(1).toLowerCase()}')
      .join(' ');
}

/// Mobile is guest/athlete-only (staff use the web platform), so there is
/// exactly one lifecycle-label voice — the public one (matches web
/// `eventPublicLifecycleLabel`). `registration` displays as "Upcoming",
/// not the old "Open for registration" (that signup step no longer exists).
String eventPublicLifecycleLabel(String status) {
  switch (status) {
    case 'draft':
      return 'Preparing';
    case 'registration':
      return 'Upcoming';
    case 'in_progress':
      return 'Ongoing';
    case 'completed':
      return 'Finished';
    case 'cancelled':
      return 'Cancelled';
    default:
      return formatEnumLabel(status);
  }
}

String matchStatusLabel(String status) {
  switch (status) {
    case 'scheduled':
      return 'Scheduled';
    case 'live':
      return 'Live now';
    case 'completed':
      return 'Completed';
    case 'cancelled':
      return 'Cancelled';
    default:
      return formatEnumLabel(status);
  }
}

String formatDateTime(String? iso) {
  if (iso == null || iso.isEmpty) return '—';
  final d = DateTime.tryParse(iso);
  if (d == null) return '—';
  return DateFormat('MMM d, y · h:mm a').format(d.toLocal());
}

String formatShortDate(String? iso) {
  if (iso == null || iso.isEmpty) return '—';
  final d = DateTime.tryParse(iso);
  if (d == null) return '—';
  return DateFormat('MMM d').format(d.toLocal());
}

String initialsFromName(String? name) {
  if (name == null || name.trim().isEmpty) return '?';
  final parts = name.trim().split(RegExp(r'\s+'));
  if (parts.length == 1) {
    return parts[0].length >= 2 ? parts[0].substring(0, 2).toUpperCase() : parts[0].toUpperCase();
  }
  return ('${parts[0][0]}${parts[parts.length - 1][0]}').toUpperCase();
}
