# The public athlete profile hides the position tag when there is no position, like the Android app

Written against: 11f5963

## Evidence chain

- Surface: public athlete profile `/guest/athletes/:id`, reached from team rosters, leaderboards and the athlete dashboard roster. The tag row sits under the athlete's name in the header card.
- Problem: the position tag is always drawn. When an athlete has no position, the row starts with an empty grey pill before "#12" and the year level. This happens for every table tennis athlete (the sport has no positions) and for anyone a coach has not assigned yet. The jersey tag beside it is already hidden when empty, and the Android app hides each tag when it has no value.
- Design evidence:
  - `apps/web/src/pages/guest/AthleteProfile.tsx` ~L115-119: `<Badge size="sm">{athlete.position}</Badge>` (always rendered), then `{athlete.jersey_number && <Badge size="sm">#{athlete.jersey_number}</Badge>}` (conditional), then `<Badge size="sm">{athlete.year_level}</Badge>`.
  - Empty positions are normal data: `supabase/migrations/002_profiles_roles.sql` L34, `position TEXT DEFAULT ''`. `supabase/migrations/025_table_tennis_roster_positions_empty.sql` makes table tennis have no positions to pick.
  - `Badge` (`apps/web/src/components/ui/index.tsx` ~L271-296) always draws its padding, border and background, so an empty child still renders a visible pill.
  - Shared web/mobile feature: the Android public athlete profile shows each tag only when it has a value: `mobile/lib/screens/athlete_profile_screen.dart` ~L112, `if (position != null && position.isNotEmpty) _heroTag(position)`.
- Owner: the tag row in `AthleteProfile.tsx`.
- Scope and affected surfaces: the position tag only.
- Uncertainty: none. `year_level` is set for every athlete, so its tag is left as it is.

## Design decision

The position tag renders only when `athlete.position?.trim()` is non-empty. This is the same rule the jersey tag beside it and the Android profile already follow. The remaining tags keep their order and style.

## Reuse

- `Badge` (`size="sm"`, default variant), unchanged.
- Exemplars: the jersey tag on the same line (`AthleteProfile.tsx` ~L117) and `mobile/lib/screens/athlete_profile_screen.dart` ~L112.

No new primitive is needed.

## Changes

1. `apps/web/src/pages/guest/AthleteProfile.tsx` (~L116)
   - Change: wrap the position badge in a condition on `athlete.position?.trim()`, and render the trimmed value.
   - Preserve: the jersey and year-level tags, the `flex gap-2 mt-2` row, the initials avatar and the sport tag.
   - Verify: a table tennis athlete's profile shows "#jersey" and the year level with no empty pill in front; a basketball athlete with a position still shows it first.

## Scope

- Inherit: every public athlete profile.
- Verify: the signed-in athlete's own My Profile (`apps/web/src/pages/athlete/Profile.tsx`, which shows "—" for an empty position in a details grid) is unchanged.
- Exclude: changing how positions are assigned, and the staff Athletes pages.

## Validation

- Product: a visitor viewing a table tennis player sees only tags that say something, as on the phone.
- Interface: `/guest/athletes/:id` for a table tennis athlete, a basketball athlete with a position and one without; light and dark themes; 390px width.
- System: same `Badge`; the rule matches the jersey tag and the Android screen.
- Repository: `cd apps/web && npx tsc --noEmit -p .` -> exits 0 with no output.

## Stop conditions

- Stop if `position` becomes required for every sport, or if the product owner wants a placeholder such as "No position" instead (then use the same placeholder on the Android profile, decided once).

## Design documentation

- After acceptance and validation: none (no design documentation exists in the repository).
