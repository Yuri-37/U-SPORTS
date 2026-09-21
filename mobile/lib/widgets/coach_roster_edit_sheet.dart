import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../services/api_service.dart';
import '../theme/layout_tokens.dart';
import '../utils/error_helpers.dart';

/// Position options per sport. Mirrors POSITIONS_BY_SPORT in
/// apps/web/src/pages/organizer/Teams.tsx so a coach picks from the same list
/// on either platform — the value is stored as free text on `athletes`.
const Map<String, List<String>> positionsBySport = {
  'basketball': [
    'Point Guard',
    'Shooting Guard',
    'Small Forward',
    'Power Forward',
    'Center',
  ],
  'volleyball': [
    'Outside Hitter',
    'Opposite Hitter',
    'Middle Blocker',
    'Setter',
    'Libero',
    'Defensive Specialist',
  ],
  'table-tennis': <String>[],
};

/// What the sheet changed, so the caller knows whether to refetch.
class RosterEditResult {
  const RosterEditResult({required this.changed});
  final bool changed;
}

/// Courtside roster edit: jersey number, position, and whether the player is
/// in the starting lineup. These are the three things a coach adjusts with a
/// phone in hand; everything heavier (adding or removing players, imports)
/// stays on the web platform.
///
/// Every write goes through the API, which re-checks that this coach may touch
/// this sport and enforces the jersey/lineup rules — the sheet only reports
/// what comes back.
class CoachRosterEditSheet extends ConsumerStatefulWidget {
  const CoachRosterEditSheet({
    super.key,
    required this.teamId,
    required this.sport,
    required this.athleteId,
    required this.membershipId,
    required this.name,
    required this.jerseyNumber,
    required this.position,
    required this.isStarting,
  });

  final String teamId;
  final String sport;
  final String athleteId;
  final String membershipId;
  final String name;
  final String? jerseyNumber;
  final String? position;
  final bool isStarting;

  @override
  ConsumerState<CoachRosterEditSheet> createState() => _CoachRosterEditSheetState();
}

class _CoachRosterEditSheetState extends ConsumerState<CoachRosterEditSheet> {
  late final TextEditingController _jersey =
      TextEditingController(text: widget.jerseyNumber ?? '');
  late String _position = widget.position ?? '';
  late bool _starting = widget.isStarting;
  bool _saving = false;
  String? _error;

  @override
  void dispose() {
    _jersey.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    setState(() {
      _saving = true;
      _error = null;
    });
    final api = ref.read(apiClientProvider);
    var changed = false;

    try {
      final jersey = _jersey.text.trim();
      final jerseyChanged = jersey != (widget.jerseyNumber ?? '');
      final positionChanged = _position != (widget.position ?? '');

      if (jerseyChanged || positionChanged) {
        await api.patchJson('/athletes/${widget.athleteId}/roster-details', body: {
          if (jerseyChanged) 'jersey_number': jersey,
          if (positionChanged) 'position': _position,
        });
        changed = true;
      }

      if (_starting != widget.isStarting) {
        // A null slot benches the player. For a promotion the server decides
        // whether the resulting lineup is legal for the sport, so an
        // over-full lineup comes back as an error rather than being capped
        // silently here.
        await api.patchJson('/teams/${widget.teamId}/lineup', body: {
          'slots': [
            {
              'member_id': widget.membershipId,
              'lineup_slot': _starting ? 1 : null,
            }
          ],
        });
        changed = true;
      }

      if (!mounted) return;
      Navigator.of(context).pop(RosterEditResult(changed: changed));
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _saving = false;
        // A rejected jersey (already taken) or a full lineup arrives here as
        // the server's own message — the coach needs to read it, not a
        // generic failure.
        _error = friendlyError(e);
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final options = positionsBySport[widget.sport] ?? const <String>[];

    return Padding(
      padding: EdgeInsets.only(
        left: 20,
        right: 20,
        top: 20,
        bottom: MediaQuery.of(context).viewInsets.bottom + 24,
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(widget.name,
              style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w800)),
          const SizedBox(height: 4),
          Text(
            'Roster details',
            style: TextStyle(color: LayoutTokens.secondaryText(context), fontSize: 13),
          ),
          const SizedBox(height: 20),
          TextField(
            controller: _jersey,
            enabled: !_saving,
            keyboardType: TextInputType.number,
            inputFormatters: [
              FilteringTextInputFormatter.digitsOnly,
              LengthLimitingTextInputFormatter(3),
            ],
            decoration: const InputDecoration(
              labelText: 'Jersey number',
              hintText: 'Leave empty for none',
              border: OutlineInputBorder(),
            ),
          ),
          if (options.isNotEmpty) ...[
            const SizedBox(height: 16),
            DropdownButtonFormField<String>(
              initialValue: _position.isEmpty ? '' : _position,
              decoration: const InputDecoration(
                labelText: 'Position',
                border: OutlineInputBorder(),
              ),
              items: [
                const DropdownMenuItem(value: '', child: Text('No position')),
                ...options.map((p) => DropdownMenuItem(value: p, child: Text(p))),
              ],
              onChanged:
                  _saving ? null : (v) => setState(() => _position = v ?? ''),
            ),
          ],
          const SizedBox(height: 8),
          SwitchListTile(
            contentPadding: EdgeInsets.zero,
            title: const Text('Starting lineup'),
            subtitle: Text(
              _starting ? 'In the starting lineup' : 'On the bench',
              style: TextStyle(color: LayoutTokens.secondaryText(context)),
            ),
            value: _starting,
            onChanged: _saving ? null : (v) => setState(() => _starting = v),
          ),
          if (_error != null) ...[
            const SizedBox(height: 8),
            Text(_error!, style: TextStyle(color: Theme.of(context).colorScheme.error)),
          ],
          const SizedBox(height: 16),
          SizedBox(
            height: 48,
            child: FilledButton(
              onPressed: _saving ? null : _save,
              child: _saving
                  ? const SizedBox(
                      width: 20,
                      height: 20,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    )
                  : const Text('Save',
                      style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700)),
            ),
          ),
        ],
      ),
    );
  }
}
