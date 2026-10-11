# Android: the "Good" password-strength colour stays readable in dark mode

Written against: 11f5963

## Evidence chain

- Surface: Android app, Settings -> Security -> change password (`ChangePasswordSection`, shown to signed-in athletes and coaches). While typing a new password, the strength meter shows a bar and a label: Weak, Fair, Good or Strong.
- Problem: "Good" draws its bar and its label text in `AppTheme.accent`, the fixed school navy `#002D62`. In dark mode the card is `#16161E`, so the "Good" label is navy text on a near-black card. The theme's own rule says navy text must switch to the dark-mode ink.
- Design evidence:
  - `mobile/lib/theme/app_theme.dart` ~L20-22, on `accent`: "Kept for existing references; resolves to the school navy rather than the old electric blue. Prefer [brandInk] for text so dark mode stays legible."
  - Same file ~L6-11 (layout language): "interactive color is the school navy (and a soft blue tint of it in dark mode, where navy text would disappear)."
  - `AppTheme.brandInk(context)` ~L41-43 returns `brandInkDark` (`#8FB2FF`) in dark mode and `schoolPrimary` in light mode.
  - `mobile/lib/widgets/password_strength_meter.dart` L25: `if (points == 3) return const _StrengthResult('Good', AppTheme.accent, 0.75);`. L55-57 uses `result.color` for the label text and L49 for the bar.
  - Runtime: `mobile/lib/widgets/change_password_section.dart` L158 renders `PasswordStrengthMeter(password: _newCtrl.text)`. `AppTheme.accent` has no other user in `mobile/lib`.
- Owner: `AppTheme.brandInk` in `mobile/lib/theme/app_theme.dart`.
- Scope and affected surfaces: the "Good" state of `PasswordStrengthMeter`, which only appears inside `ChangePasswordSection`.
- Uncertainty: none.

## Design decision

The "Good" state uses `AppTheme.brandInk(context)`: navy on the light sheet, the soft blue tint in dark mode. This is exactly what the theme prescribes for brand-colored text. Weak, Fair and Strong keep their colors. The app keeps its own no-bright-blue rule, so it does not copy the web meter's `#0066FF`.

## Reuse

- `AppTheme.brandInk(context)` (`mobile/lib/theme/app_theme.dart`)
- Exemplar: `mobile/lib/widgets/guest_privacy_notice.dart` (icon color `AppTheme.brandInk(context)`) and `mobile/lib/widgets/update_available_card.dart`.

No new primitive is needed.

## Changes

1. `mobile/lib/widgets/password_strength_meter.dart` (`_score`, L25)
   - Change: the `points == 3` result uses `AppTheme.brandInk(context)` instead of `AppTheme.accent`. The `_StrengthResult` for that branch can no longer be `const`; `context` is already a parameter of `_score`.
   - Preserve: the scoring heuristic, the labels, the fractions (0.25/0.5/0.75/1.0), the Weak/Fair/Strong colors, and the bar and label layout.
   - Verify: in dark mode the "Good" bar and label render in the soft blue `#8FB2FF`; in light mode they stay navy.

## Scope

- Inherit: the change-password card in athlete and coach Settings.
- Verify: `mobile/lib/screens/reset_password_screen.dart` does not render the meter (it currently does not), so it is unaffected.
- Exclude: the web meter (`apps/web/src/components/ui/PasswordStrengthMeter.tsx`), `AppTheme.accent` itself (keep it for any future references the doc mentions), and the scoring logic.

## Validation

- Product: an athlete changing their password in dark mode can read the strength label at every level.
- Interface: Settings -> change password; type passwords that score Weak, Fair, Good and Strong; check both themes on a phone-size screen.
- System: no new color constant; the meter uses `AppTheme.brandInk`.
- Repository: `cd mobile && flutter analyze` -> "No issues found!"; `cd mobile && flutter test` -> all tests pass.

## Stop conditions

- Stop if `AppTheme.brandInk` no longer switches by brightness, or if the meter has gained other callers that sit on a navy surface (where brand ink would not be the right ink).

## Design documentation

- After acceptance and validation: none (no design documentation exists in the repository beyond the theme comments, which already state this rule).
