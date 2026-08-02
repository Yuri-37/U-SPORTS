import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import '../providers/auth_provider.dart';
import '../providers/notifications_provider.dart';
import '../theme/app_theme.dart';
import '../theme/layout_tokens.dart';
import '../utils/format_helpers.dart';

/// Icon + accent color for a notification's `type` (see server routes
/// `teams.ts`, `events.ts`, `announcements.ts` for the values this covers).
(IconData, Color) _typeStyle(String type, BuildContext context) {
  switch (type) {
    case 'announcement_emergency':
      return (Icons.warning_rounded, AppTheme.danger);
    case 'announcement_reschedule':
      return (Icons.event_repeat_rounded, AppTheme.warning);
    case 'announcement_reminder':
      return (Icons.notifications_active_rounded, AppTheme.accent);
    case 'announcement_system':
      return (Icons.campaign_rounded, LayoutTokens.mutedText(context));
    case 'added_to_team':
      return (Icons.groups_rounded, LayoutTokens.success(context));
    case 'lineup_updated':
      return (Icons.list_alt_rounded, AppTheme.accent);
    case 'team_added_to_event':
      return (Icons.emoji_events_rounded, AppTheme.accent);
    case 'match_scheduled':
      return (Icons.calendar_month_rounded, AppTheme.accent);
    default:
      return (Icons.notifications_rounded, LayoutTokens.mutedText(context));
  }
}

class NotificationsScreen extends ConsumerStatefulWidget {
  const NotificationsScreen({super.key});

  @override
  ConsumerState<NotificationsScreen> createState() => _NotificationsScreenState();
}

enum _Filter { all, unread, recent }

const _recentWindow = Duration(days: 7);

class _NotificationsScreenState extends ConsumerState<NotificationsScreen> {
  _Filter _filter = _Filter.all;

  List<Map<String, dynamic>> _applyFilter(List<Map<String, dynamic>> rows) {
    switch (_filter) {
      case _Filter.unread:
        return rows.where((r) => r['read'] != true).toList();
      case _Filter.recent:
        final cutoff = DateTime.now().subtract(_recentWindow);
        return rows.where((r) {
          final created = DateTime.tryParse(r['created_at'] as String? ?? '');
          return created != null && created.isAfter(cutoff);
        }).toList();
      case _Filter.all:
        return rows;
    }
  }

  Future<void> _clearOne(String id) async {
    try {
      await deleteNotification(id);
      ref.invalidate(notificationsListProvider);
      ref.invalidate(unreadNotificationsCountProvider);
    } catch (_) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Could not clear notification. Try again.')),
      );
    }
  }

  Future<void> _confirmClearAll(String? recipientId) async {
    if (recipientId == null) return;
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: LayoutTokens.cardBackground(ctx),
        title: const Text('Clear all notifications?'),
        content: const Text('This removes every notification from your inbox. You cannot undo this.'),
        actions: [
          TextButton(onPressed: () => Navigator.of(ctx).pop(false), child: const Text('Cancel')),
          FilledButton(
            style: FilledButton.styleFrom(backgroundColor: AppTheme.danger),
            onPressed: () => Navigator.of(ctx).pop(true),
            child: const Text('Clear all'),
          ),
        ],
      ),
    );
    if (confirmed != true || !mounted) return;
    try {
      await clearAllNotifications(recipientId);
      ref.invalidate(notificationsListProvider);
      ref.invalidate(unreadNotificationsCountProvider);
    } catch (_) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Could not clear notifications. Try again.')),
      );
    }
  }

  /// Marks the row read, then routes to whatever it's actually about — a team,
  /// an event, or (for announcements, which have no dedicated screen) the full
  /// message, since the list only shows a 2-line preview.
  Future<void> _handleTap(Map<String, dynamic> row) async {
    final id = row['id'] as String;
    final type = row['type'] as String? ?? '';
    final data = row['data'] as Map<String, dynamic>? ?? const {};

    try {
      await markNotificationRead(id);
      ref.invalidate(notificationsListProvider);
      ref.invalidate(unreadNotificationsCountProvider);
    } catch (_) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Could not mark as read. Try again.')),
      );
      return;
    }

    switch (type) {
      case 'added_to_team':
      case 'lineup_updated':
        final teamId = data['team_id'] as String?;
        if (teamId == null || !mounted) return;
        context.push('/teams/$teamId');
      case 'team_added_to_event':
        final eventId = data['event_id'] as String?;
        if (eventId == null || !mounted) return;
        context.push('/events/$eventId');
      case 'match_scheduled':
        final matchId = data['match_id'] as String?;
        if (matchId == null) return;
        final match = await Supabase.instance.client.from('matches').select('event_id').eq('id', matchId).maybeSingle();
        final eventId = match?['event_id'] as String?;
        if (eventId == null || !mounted) return;
        context.push('/events/$eventId');
      default:
        if (!mounted) return;
        _showFullMessage(row);
    }
  }

  void _showFullMessage(Map<String, dynamic> row) {
    showDialog(
      context: context,
      builder: (ctx) => Dialog(
        backgroundColor: LayoutTokens.cardBackground(ctx),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
        child: Padding(
          padding: const EdgeInsets.all(20),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(row['title'] as String? ?? 'Notice', style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w800)),
              const SizedBox(height: 10),
              Text(
                row['body'] as String? ?? '',
                style: TextStyle(fontSize: 14, height: 1.4, color: LayoutTokens.secondaryText(ctx)),
              ),
              const SizedBox(height: 16),
              Text(
                formatDateTime(row['created_at'] as String?),
                style: TextStyle(fontSize: 12, color: LayoutTokens.mutedText(ctx)),
              ),
              const SizedBox(height: 16),
              Align(
                alignment: Alignment.centerRight,
                child: TextButton(
                  onPressed: () => Navigator.of(ctx).pop(),
                  child: const Text('Close'),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final listAsync = ref.watch(notificationsListProvider);
    final profile = ref.watch(profileProvider);
    final scheme = Theme.of(context).colorScheme;
    final rows = listAsync.valueOrNull ?? const [];
    final unreadCount = rows.where((r) => r['read'] != true).length;

    return Scaffold(
      backgroundColor: Theme.of(context).scaffoldBackgroundColor,
      appBar: AppBar(
        title: const Text('Notifications'),
        actions: [
          if (profile.valueOrNull != null && unreadCount > 0)
            TextButton.icon(
              onPressed: () async {
                final p = profile.valueOrNull!;
                try {
                  await markAllNotificationsRead(p.id);
                  ref.invalidate(notificationsListProvider);
                  ref.invalidate(unreadNotificationsCountProvider);
                } catch (_) {
                  if (!context.mounted) return;
                  ScaffoldMessenger.of(context).showSnackBar(
                    const SnackBar(content: Text('Could not mark notifications as read. Try again.')),
                  );
                }
              },
              icon: const Icon(Icons.done_all_rounded, size: 18),
              label: const Text('Read all'),
            ),
          if (rows.isNotEmpty)
            IconButton(
              icon: const Icon(Icons.delete_sweep_outlined),
              tooltip: 'Clear all',
              onPressed: () => _confirmClearAll(profile.valueOrNull?.id),
            ),
        ],
      ),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(14, 10, 14, 0),
            child: Row(
              children: [
                _FilterChip(label: 'All', selected: _filter == _Filter.all, onTap: () => setState(() => _filter = _Filter.all)),
                const SizedBox(width: 8),
                _FilterChip(label: 'Unread', selected: _filter == _Filter.unread, onTap: () => setState(() => _filter = _Filter.unread)),
                const SizedBox(width: 8),
                _FilterChip(label: 'Recent', selected: _filter == _Filter.recent, onTap: () => setState(() => _filter = _Filter.recent)),
              ],
            ),
          ),
          Expanded(
            child: listAsync.when(
              loading: () => const Center(child: CircularProgressIndicator()),
              error: (e, _) => Center(
                child: Text('$e', style: TextStyle(color: scheme.error)),
              ),
              data: (allRows) {
                Widget body;
                final rows = _applyFilter(allRows);

                if (allRows.isEmpty) {
                  body = Center(
                    child: Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 32),
                      child: Column(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Icon(Icons.notifications_none_rounded, size: 48, color: LayoutTokens.mutedText(context)),
                          const SizedBox(height: 12),
                          Text(
                            'No messages from organizers yet.',
                            textAlign: TextAlign.center,
                            style: TextStyle(color: LayoutTokens.secondaryText(context)),
                          ),
                        ],
                      ),
                    ),
                  );
                } else if (rows.isEmpty) {
                  body = Center(
                    child: Text(
                      'No notifications match this filter.',
                      style: TextStyle(color: LayoutTokens.secondaryText(context)),
                    ),
                  );
                } else {
                  body = ListView.builder(
                    physics: const AlwaysScrollableScrollPhysics(),
                    padding: const EdgeInsets.fromLTRB(14, 12, 14, 24),
                    itemCount: rows.length,
                    itemBuilder: (context, i) {
                      final r = rows[i];
                      final id = r['id'] as String;
                      final read = r['read'] == true;
                      final type = r['type'] as String? ?? '';
                      final (icon, color) = _typeStyle(type, context);

                      return Padding(
                        padding: const EdgeInsets.only(bottom: 10),
                        child: Material(
                          color: read
                              ? LayoutTokens.cardBackground(context)
                              : Color.alphaBlend(color.withValues(alpha: 0.07), LayoutTokens.cardBackground(context)),
                          borderRadius: BorderRadius.circular(14),
                          child: InkWell(
                            borderRadius: BorderRadius.circular(14),
                            onTap: () => _handleTap(r),
                            child: Container(
                              decoration: BoxDecoration(
                                borderRadius: BorderRadius.circular(14),
                                border: Border.all(
                                  color: read ? LayoutTokens.borderSubtle(context) : color.withValues(alpha: 0.35),
                                ),
                              ),
                              padding: const EdgeInsets.fromLTRB(14, 14, 6, 14),
                              child: Row(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Container(
                                    width: 40,
                                    height: 40,
                                    decoration: BoxDecoration(color: color.withValues(alpha: 0.15), shape: BoxShape.circle),
                                    child: Icon(icon, color: color, size: 20),
                                  ),
                                  const SizedBox(width: 12),
                                  Expanded(
                                    child: Column(
                                      crossAxisAlignment: CrossAxisAlignment.start,
                                      children: [
                                        Row(
                                          crossAxisAlignment: CrossAxisAlignment.start,
                                          children: [
                                            Expanded(
                                              child: Text(
                                                r['title'] as String? ?? 'Notice',
                                                style: TextStyle(
                                                  fontWeight: read ? FontWeight.w600 : FontWeight.w800,
                                                  fontSize: 14,
                                                  color: LayoutTokens.primaryText(context),
                                                ),
                                              ),
                                            ),
                                            if (!read)
                                              Container(
                                                width: 8,
                                                height: 8,
                                                margin: const EdgeInsets.only(left: 8, top: 4),
                                                decoration: const BoxDecoration(color: AppTheme.accent, shape: BoxShape.circle),
                                              ),
                                          ],
                                        ),
                                        const SizedBox(height: 4),
                                        Text(
                                          r['body'] as String? ?? '',
                                          maxLines: 2,
                                          overflow: TextOverflow.ellipsis,
                                          style: TextStyle(fontSize: 13, height: 1.35, color: LayoutTokens.secondaryText(context)),
                                        ),
                                        const SizedBox(height: 6),
                                        Text(
                                          formatDateTime(r['created_at'] as String?),
                                          style: TextStyle(
                                            fontSize: 11,
                                            fontWeight: FontWeight.w600,
                                            color: LayoutTokens.mutedText(context),
                                          ),
                                        ),
                                      ],
                                    ),
                                  ),
                                  IconButton(
                                    icon: const Icon(Icons.close_rounded, size: 18),
                                    color: LayoutTokens.mutedText(context),
                                    tooltip: 'Clear',
                                    onPressed: () => _clearOne(id),
                                  ),
                                ],
                              ),
                            ),
                          ),
                        ),
                      );
                    },
                  );
                }

                return RefreshIndicator(
                  onRefresh: () async {
                    ref.invalidate(notificationsListProvider);
                    ref.invalidate(unreadNotificationsCountProvider);
                    ref.invalidate(profileProvider);
                  },
                  child: body,
                );
              },
            ),
          ),
        ],
      ),
    );
  }
}

class _FilterChip extends StatelessWidget {
  const _FilterChip({required this.label, required this.selected, required this.onTap});
  final String label;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return ChoiceChip(
      label: Text(label),
      selected: selected,
      onSelected: (_) => onTap(),
      selectedColor: AppTheme.accent,
      backgroundColor: LayoutTokens.chipBackground(context),
      labelStyle: TextStyle(
        fontWeight: FontWeight.w600,
        color: selected ? Colors.white : LayoutTokens.primaryText(context),
      ),
      side: BorderSide(color: LayoutTokens.borderSubtle(context)),
    );
  }
}
