import 'dart:async';
import 'dart:io';

import 'package:supabase_flutter/supabase_flutter.dart';

/// A short, non-technical message safe to show directly in the UI. Screens
/// were previously interpolating raw exceptions (`'$e'`) into error states,
/// surfacing things like `ClientException with SocketException: Failed host
/// lookup...` or `AuthApiException(message: ..., statusCode: 400, ...)`
/// straight to users — this maps the common cases to plain language instead.
///
/// [authActionLabel] overrides the generic "Sign-in failed" wording for auth
/// exceptions raised by a *different* auth action (e.g. setting a new
/// password on reset_password_screen -- "Sign-in failed" is actively
/// misleading there, since nothing about signing in was attempted). Defaults
/// to the sign-in wording, since most callers are the actual login screen or
/// unrelated data-loading error states that never throw an auth exception.
String friendlyError(Object error, {String? authActionLabel}) {
  final actionFailedMessage = authActionLabel != null
      ? '$authActionLabel failed. Please try again.'
      : 'Sign-in failed. Please try again.';
  if (error is AuthApiException) {
    if (error.code == 'invalid_credentials') return 'Incorrect email or password.';
    return actionFailedMessage;
  }
  if (error is AuthException) return actionFailedMessage;
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
