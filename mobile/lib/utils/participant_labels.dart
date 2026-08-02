import 'dart:convert';

import 'package:http/http.dart' as http;
import 'package:supabase_flutter/supabase_flutter.dart';

import '../config/env.dart';

/// Resolve UUIDs to display names: teams first, then athletes (profile full_name).
/// Uses the API (service role) when available — same reliable path as the web backend.
Future<Map<String, String>> fetchParticipantLabels(List<String> ids) async {
  final uniq = ids.toSet().toList()..removeWhere((e) => e.isEmpty);
  final map = <String, String>{};
  if (uniq.isEmpty) return map;

  try {
    final base = Env.apiBaseUrl.replaceAll(RegExp(r'/+$'), '');
    final qs = uniq.map(Uri.encodeComponent).join(',');
    final res = await http.get(
      Uri.parse('$base/participants/labels?ids=$qs'),
      headers: const {'Content-Type': 'application/json'},
    );
    if (res.statusCode >= 200 && res.statusCode < 300 && res.body.isNotEmpty) {
      final body = jsonDecode(res.body);
      if (body is Map) {
        for (final e in body.entries) {
          final v = e.value;
          if (v != null) map[e.key.toString()] = v.toString();
        }
        if (map.length >= uniq.length || map.isNotEmpty) return map;
      }
    }
  } catch (_) {
    // Fall through to Supabase (e.g. when API is offline but Supabase works).
  }

  final teamRows = await Supabase.instance.client.from('teams').select('id,name').inFilter('id', uniq);
  for (final t in teamRows as List) {
    final m = Map<String, dynamic>.from(t as Map);
    map[m['id'] as String] = m['name'] as String? ?? 'Team';
  }

  final missing = uniq.where((id) => !map.containsKey(id)).toList();
  if (missing.isEmpty) return map;

  final athletes = await Supabase.instance.client
      .from('athletes')
      .select('id, profile:profiles!athletes_profile_id_fkey(full_name)')
      .inFilter('id', missing);

  for (final row in athletes as List) {
    final r = Map<String, dynamic>.from(row as Map);
    final id = r['id'] as String;
    final prof = r['profile'];
    String? n;
    if (prof is Map) {
      n = prof['full_name'] as String?;
    } else if (prof is List && prof.isNotEmpty && prof.first is Map) {
      n = (prof.first as Map)['full_name'] as String?;
    }
    if ((n ?? '').trim().isNotEmpty) {
      map[id] = n!.trim();
    }
  }

  return map;
}

List<String> collectBracketParticipantIds(List<Map<String, dynamic>> brackets) {
  final s = <String>{};
  for (final b in brackets) {
    final a = b['participant_a_id'] as String?;
    final bb = b['participant_b_id'] as String?;
    if (a != null && a.isNotEmpty) s.add(a);
    if (bb != null && bb.isNotEmpty) s.add(bb);
    final w = b['winner_id'] as String?;
    if (w != null && w.isNotEmpty) s.add(w);
  }
  return s.toList();
}

List<String> collectEventParticipantIds(Map<String, dynamic>? event) {
  if (event == null) return [];
  final parts = event['participants'] as List<dynamic>? ?? [];
  return parts
      .map((p) => (p as Map)['participant_id'] as String?)
      .whereType<String>()
      .where((id) => id.isNotEmpty)
      .toList();
}

/// Web parity: named label, short id fallback, or TBD.
String participantDisplayLabel(
  Map<String, String> labels,
  String? id, {
  String fallbackPrefix = 'Team',
}) {
  if (id == null || id.isEmpty) return 'TBD';
  final name = labels[id]?.trim();
  if (name != null && name.isNotEmpty) return name;
  final short = id.length > 8 ? '${id.substring(0, 8)}…' : id;
  return '$fallbackPrefix $short';
}
