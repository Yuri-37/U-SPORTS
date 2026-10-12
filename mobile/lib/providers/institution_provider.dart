import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import '../theme/app_theme.dart';
import '../utils/institution_logo_url.dart';

class InstitutionData {
  InstitutionData({
    required this.id,
    required this.name,
    this.abbreviation,
    this.tagline,
    this.logoUrl,
    this.primaryColorHex,
    this.secondaryColorHex,
    this.address,
    this.region,
    required this.studentEmailDomain,
  });

  factory InstitutionData.fromRow(Map<String, dynamic> j) {
    final domainRaw = (j['student_email_domain'] as String?)?.trim();
    return InstitutionData(
      id: j['id'] as String,
      name: j['name'] as String? ?? 'U-Sports',
      abbreviation: j['abbreviation'] as String?,
      tagline: j['tagline'] as String?,
      logoUrl: resolveInstitutionLogoUrl(j['logo_url'] as String?),
      primaryColorHex: j['primary_color'] as String?,
      secondaryColorHex: j['secondary_color'] as String?,
      address: j['address'] as String?,
      region: j['region'] as String?,
      studentEmailDomain: (domainRaw != null && domainRaw.isNotEmpty)
          ? domainRaw.toLowerCase()
          : 'students.nu-dasma.edu.ph',
    );
  }

  final String id;
  final String name;
  final String? abbreviation;
  final String? tagline;
  final String? logoUrl;
  final String? primaryColorHex;
  final String? secondaryColorHex;
  final String? address;
  final String? region;
  final String studentEmailDomain;
}

Color? _parseHex(String? hex) {
  if (hex == null || hex.isEmpty) return null;
  var h = hex.replaceFirst('#', '');
  if (h.length == 6) h = 'FF$h';
  if (h.length != 8) return null;
  return Color(int.parse(h, radix: 16));
}

/// The school's look (colours, name, logo) from the last launch, kept on the
/// device. [preload] runs before the first frame so the app opens already
/// wearing the school's colours and name, instead of showing built-in defaults
/// for a moment until the server answers.
class InstitutionCache {
  static const _key = 'institution_look';

  /// The last row seen, or null on a fresh install.
  static InstitutionData? cached;

  static Future<void> preload() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final raw = prefs.getString(_key);
      if (raw == null) return;
      cached = _apply(Map<String, dynamic>.from(jsonDecode(raw) as Map));
    } catch (_) {
      // A damaged cache is just no cache.
    }
  }

  static Future<void> save(Map<String, dynamic> row) async {
    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.setString(_key, jsonEncode(row));
    } catch (_) {}
  }

  /// Parses a row and applies its colours to the theme.
  static InstitutionData _apply(Map<String, dynamic> row) {
    final data = InstitutionData.fromRow(row);
    final p = _parseHex(data.primaryColorHex);
    final s = _parseHex(data.secondaryColorHex);
    if (p != null) AppTheme.schoolPrimary = p;
    if (s != null) AppTheme.schoolSecondary = s;
    return data;
  }
}

final institutionProvider = FutureProvider<InstitutionData?>((ref) async {
  final row = await Supabase.instance.client.from('institution').select().maybeSingle();
  if (row == null) return null;
  final map = Map<String, dynamic>.from(row as Map);
  final data = InstitutionCache._apply(map);
  InstitutionCache.cached = data;
  await InstitutionCache.save(map);
  return data;
});
