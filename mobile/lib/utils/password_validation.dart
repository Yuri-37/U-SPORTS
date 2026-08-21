/// The one password rule for the whole app, ported from
/// apps/server/src/utils/passwordSchema.ts (authoritative) and mirrored in
/// apps/web/src/lib/validation/forms.ts's `passwordZ`. Every screen that
/// lets someone choose a password validates against this -- reset password
/// and change password both call this rather than each rolling their own
/// (weaker) length-only check.
///
/// Returns a friendly error message, or null when the password is valid.
String? passwordValidationError(String password) {
  if (password.length < 8) return 'Password must be at least 8 characters';
  if (password.length > 128) return 'Password is too long';
  if (!RegExp(r'[A-Za-z]').hasMatch(password)) {
    return 'Password must contain at least one letter';
  }
  if (!RegExp(r'[0-9]').hasMatch(password)) {
    return 'Password must contain at least one number';
  }
  if (password.trim().isEmpty) return 'Password cannot be only spaces';
  return null;
}
