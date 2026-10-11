# My Profile shows the athlete's season status as "Active" / "Inactive", the same as the dashboard

Written against: 11f5963

## Evidence chain

- Surface: athlete portal, `/athlete/profile` (My Profile), the badge row under the athlete's name.
- Problem: the season status badge prints the raw database value, so it reads "active" or "inactive" in lowercase. The athlete's own dashboard, one click away, shows the same field in the same badge as "Active" / "Inactive".
- Design evidence (direct contradiction within the same task):
  - `apps/web/src/pages/athlete/Profile.tsx` ~L187-189: `<Badge variant={athlete.season_status === 'active' ? 'success' : 'default'}>{athlete.season_status}</Badge>`.
  - `apps/web/src/pages/athlete/Dashboard.tsx` ~L790-792: same `Badge` and variant, text `{athlete.season_status === 'active' ? 'Active' : 'Inactive'}`.
  - Staff see the same field the same way: `apps/web/src/pages/organizer/Athletes.tsx` ~L731-732.
- Owner: the badge text in `Profile.tsx`.
- Scope and affected surfaces: that one badge.
- Uncertainty: none.

## Design decision

The Profile badge uses the same text as the dashboard and the staff Athletes list: "Active" when `season_status === 'active'`, otherwise "Inactive". Variant and position stay as they are.

## Reuse

- `Badge` (`apps/web/src/components/ui`), variants `success` / `default` as already used.
- Exemplar: `apps/web/src/pages/athlete/Dashboard.tsx` ~L790-792.

No new primitive is needed.

## Changes

1. `apps/web/src/pages/athlete/Profile.tsx` (~L187-189)
   - Change: the badge text becomes `athlete.season_status === 'active' ? 'Active' : 'Inactive'`.
   - Preserve: the badge variant, the sport badge beside it, and the AvatarUpload card layout.
   - Verify: an active athlete's profile shows "Active" (green); an inactive one shows "Inactive" (grey).

## Scope

- Inherit: My Profile for every athlete.
- Verify: the dashboard header badge is unchanged.
- Exclude: the staff Athletes page and the season status values themselves.

## Validation

- Product: an athlete sees their status written the same way on the dashboard and the profile.
- Interface: `/athlete/profile` for an active and an inactive athlete; light and dark themes; 390px width.
- System: no new label helper; the text matches the dashboard's expression.
- Repository: `cd apps/web && npx tsc --noEmit -p .` -> exits 0 with no output.

## Stop conditions

- Stop if `season_status` gains a third value (then both badges need the same new label, decided once).

## Design documentation

- After acceptance and validation: none (no design documentation exists in the repository).
