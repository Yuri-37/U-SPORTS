import 'dart:async';
import 'dart:io';

import 'package:supabase_flutter/supabase_flutter.dart';

/// A short, non-technical message safe to show directly in the UI. Screens
/// were previously interpolating raw exceptions (`'$e'`) into error states,
/// surfacing things like `ClientException with SocketException: Failed host
/// lookup...` or `AuthApiException(message: ..., statusCode: 400, ...)`
/// straight to users — this maps the common cases to plain language instead.
String friendlyError(Object error) {
  if (error is AuthApiException) {
    if (error.code == 'invalid_credentials') return 'Incorrect email or password.';
    return 'Sign-in failed. Please try again.';
  }
  if (error is AuthException) return 'Sign-in failed. Please try again.';
  if (error is PostgrestException) return "Couldn't load this right now. Please try again.";
  if (error is SocketException) return 'No internet connection. Check your network and try again.';
  if (error is TimeoutException) return 'This is taking too long. Please try again.';

  final text = error.toString();
  if (text.contains('SocketException') || text.contains('Failed host lookup')) {
    return 'No internet connection. Check your network and try again.';
  }
  if (text.contains('ClientException')) {
    return "Couldn't reach the server. Please try again.";
  }
  return 'Something went wrong. Please try again.';
}
