import 'dart:convert';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:http/http.dart' as http;
import 'package:supabase_flutter/supabase_flutter.dart';

import '../config/env.dart';

/// Attachment point for Bearer tokens on outgoing API calls.
final apiClientProvider = Provider<ApiClient>((ref) {
  return ApiClient();
});

class ApiClient {
  Uri _uri(String path, [Map<String, String>? query]) {
    final base = Env.apiBaseUrl.replaceAll(RegExp(r'/+$'), '');
    final rel = path.startsWith('/') ? path.substring(1) : path;
    final url = '$base/$rel';
    return Uri.parse(url).replace(queryParameters: query);
  }

  Future<String?> _bearer() async {
    final session = Supabase.instance.client.auth.currentSession;
    return session?.accessToken;
  }

  Future<dynamic> getJson(String path, {Map<String, String>? query}) async {
    final token = await _bearer();
    final res = await http.get(
      _uri(path, query),
      headers: {
        'Content-Type': 'application/json',
        if (token != null) 'Authorization': 'Bearer $token',
      },
    );
    _throwIfError(res);
    if (res.body.isEmpty) return null;
    return jsonDecode(res.body);
  }

  Future<dynamic> postJson(String path, {Map<String, dynamic>? body}) async {
    final token = await _bearer();
    final res = await http.post(
      _uri(path),
      headers: {
        'Content-Type': 'application/json',
        if (token != null) 'Authorization': 'Bearer $token',
      },
      body: body == null ? null : jsonEncode(body),
    );
    _throwIfError(res);
    if (res.body.isEmpty) return null;
    return jsonDecode(res.body);
  }

  void _throwIfError(http.Response res) {
    if (res.statusCode >= 200 && res.statusCode < 300) return;
    String msg = 'Request failed (${res.statusCode})';
    try {
      final j = jsonDecode(res.body);
      if (j is Map && j['error'] != null) msg = j['error'].toString();
    } catch (_) {
      msg = res.body.isNotEmpty ? res.body : msg;
    }
    throw ApiException(res.statusCode, msg);
  }
}

class ApiException implements Exception {
  ApiException(this.statusCode, this.message);
  final int statusCode;
  final String message;
  @override
  String toString() => message;
}
