# Announcement list badges use the same words as the form that created them

Written against: 11f5963

## Evidence chain

- Surface: `/organizer/announcements`: the announcement list, and the Create/Edit Announcement form on the same page.
- Problem: the form offers "Emergency — critical alert", "Reschedule — high priority", "Reminder — normal priority", "System — low priority" and the display types "Notification only", "Scrolling banner", "Hero slider". Once saved, each list card shows the raw database values as badges: "emergency", "reschedule", "scrolling banner", "hero slider", "public". These are lowercase and, for the type, the internal enum. Every other badge in the app is capitalized ("Active", "Ongoing", "Finished", "Upcoming").
- Design evidence (direct contradiction within the same task):
  - `apps/web/src/pages/organizer/Announcements.tsx` ~L305-322: `<Badge …>{a.type}</Badge>`, then literal badges `scrolling banner`, `hero slider`, `public`.
  - Same file, form: type options (~L400-405) "Emergency — critical alert" etc.; display-type buttons (~L535-537) "Notification only", "Scrolling banner", "Hero slider"; visibility checkbox "Visible to guests (public)".
  - `formatEnumLabel` in `apps/web/src/lib/utils.ts` already turns `emergency` into "Emergency" and is used for enum badges elsewhere (for example `formatEnumLabel(s.status)` on the organizer Seasons page).
- Owner: the list card in `Announcements.tsx`.
- Scope and affected surfaces: the four badges on each announcement card.
- Uncertainty: none.

## Design decision

The list badges use the form's own words in sentence case: the type via `formatEnumLabel(a.type)` ("Emergency", "Reschedule", "Reminder", "System"), and the display modes exactly as the form labels them ("Scrolling banner", "Hero slider"). The visibility badge reads "Public", the word the form's checkbox already uses. Badge variants and colors stay as they are.

## Reuse

- `formatEnumLabel` from `apps/web/src/lib/utils.ts`
- The form's existing display-type labels in the same file.
- Exemplar: `apps/web/src/pages/organizer/Seasons.tsx` (`<Badge …>{formatEnumLabel(s.status)}</Badge>`).

No new primitive is needed.

## Changes

1. `apps/web/src/pages/organizer/Announcements.tsx`, list card badges (~L305-322)
   - Change: the type badge renders `formatEnumLabel(a.type)`; the literal badge texts become "Scrolling banner", "Hero slider" and "Public".
   - Preserve: badge variants (`TYPE_BADGE_VARIANTS`, warning, info), order, sizes and when each appears.
   - Verify: a reschedule announcement shown as a public scrolling banner displays "Reschedule", "Scrolling banner", "Public".

## Scope

- Inherit: every announcement card on the page.
- Verify: the type icons and colors next to the badges are unchanged.
- Exclude: the audience line under each card (already formatted by `audienceLabel`), the form itself, and announcement behavior.

## Validation

- Product: an organizer who just created an announcement sees it described in the words they picked.
- Interface: create one announcement of each type and display mode, with and without "Visible to guests"; check the list in light and dark themes and at 390px, where badges wrap.
- System: the type badge uses `formatEnumLabel`; no new label map is introduced.
- Repository: `cd apps/web && npx tsc --noEmit -p .` -> exits 0 with no output.

## Stop conditions

- Stop if new announcement types are added whose enum does not read well through `formatEnumLabel` (then confirm their display names with the product owner first).

## Design documentation

- After acceptance and validation: none (no design documentation exists in the repository).
