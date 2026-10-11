# The Edit Team lineup says "Starting", like every other lineup view on web and mobile

Written against: 11f5963

## Evidence chain

- Surface: `/organizer/teams` -> Edit Team (roster editor used by organizers, super admins and coaches): the lineup sections, per-player move buttons, bulk buttons and their messages.
- Problem: the editor calls the starting lineup "Active": a section heading "Active", "→ Active", a bulk button "Activate", and messages about "active slots" and "active players". Every other view of the same lineup calls it "Starting":
  - the public team page shows a "Starting" badge;
  - the athlete dashboard roster modal shows "Starting (slot)" and "Starting lineup";
  - the Android coach editor for this same feature has a "Starting lineup" switch with "In the starting lineup" / "On the bench".
  In this same staff area "Active" already means something else: an athlete's season status (Athletes tabs "Active / Inactive") and account activation ("Activate account").
- Design evidence:
  - Requirement: features shared between web and mobile keep the same look (this audit's brief). The coach lineup edit exists on both, and the mobile file documents that intent for this exact editor: `mobile/lib/widgets/coach_roster_edit_sheet.dart` L10-12, "Mirrors POSITIONS_BY_SPORT in apps/web/src/pages/organizer/Teams.tsx so a coach picks from the same list on either platform."
  - Web editor wording: `apps/web/src/pages/organizer/Teams.tsx` ~L2196-2204 (heading "Active", empty text "No active players yet — promote someone from the bench."), ~L2164-2167 (bulk "Activate"), ~L2369-2374 (title "All N active slots are filled" / "Set as active (slot N)", button "→ Active"), ~L754 (toast "…allows fewer active players."), ~L1080 ("Only N active slot(s) open — bench someone first or select fewer players.").
  - "Starting" elsewhere: `apps/web/src/pages/guest/TeamDetail.tsx` ~L245-248; `apps/web/src/pages/athlete/Dashboard.tsx` ~L1133, ~L1146, ~L1157; `mobile/lib/widgets/coach_roster_edit_sheet.dart` ~L241-243; `mobile/lib/screens/team_detail_screen.dart` ("Starting" badge).
- Owner: the copy in `Teams.tsx`'s roster editor (no shared label constant exists).
- Scope and affected surfaces: user-visible lineup wording in the Edit Team roster editor only.
- Uncertainty: none about which word. The exact short verb for the bulk button is specified below, so the executor does not need to choose.

## Design decision

The roster editor uses "Starting" for the lineup and keeps "Bench" for the rest, matching the public team page, the athlete roster and the Android coach editor:

- Section heading "Active" -> "Starting".
- Empty text -> "No starting players yet — promote someone from the bench."
- Per-row button "→ Active" -> "→ Starting". Its title "Set as active (slot N)" -> "Set as starter (slot N)"; "All N active slots are filled" -> "All N starting slots are filled".
- Bulk button "Activate" -> "Start" (it sits next to the existing "Bench" button: Bench / Start).
- Toast "…allows fewer active players." -> "…allows fewer starting players."
- Error "Only N active slot(s) open — …" -> "Only N starting slot(s) open — bench someone first or select fewer players."

Only text changes; buttons, variants, ordering and behavior stay as they are.

## Reuse

- Existing `Badge`, `Button` and section-heading classes in the editor, unchanged.
- Exemplars: `apps/web/src/pages/guest/TeamDetail.tsx` ("Starting" badge), `mobile/lib/widgets/coach_roster_edit_sheet.dart` ("Starting lineup").

No new primitive is needed.

## Changes

1. `apps/web/src/pages/organizer/Teams.tsx`, the roster editor (~L2160-2205, ~L2365-2376)
   - Change: apply the heading, empty-text, per-row button, button-title and bulk-button wording from the Design decision.
   - Preserve: the "Bench" heading and buttons, slot numbers, checkboxes, disabled states and all handlers (`bulkActivateSelected`, `handleSetSlot`).
   - Verify: Edit Team shows "Starting" and "Bench" sections, "→ Starting" / "→ Bench" buttons, and bulk "Bench" / "Start".
2. `apps/web/src/pages/organizer/Teams.tsx` messages (~L754, ~L1080)
   - Change: "active players" -> "starting players"; "active slot(s)" -> "starting slot(s)".
   - Preserve: the message structure, counts and when they appear.
   - Verify: changing a team to a sport with fewer slots shows "...moved to the bench — volleyball allows fewer starting players."; promoting more players than free slots shows the new error.

## Scope

- Inherit: the Edit Team roster editor for every role that can open it.
- Verify: the team cards, the public team page and the athlete roster are unchanged (they already say "Starting").
- Exclude: the roster import template and its help text (~L1771, "active or bench — blank defaults to bench") and the Teams "Lineup" import-preview column values, because those document the CSV values the importer accepts (`active` / `bench`). Also excluded: season "active" wording (~L1206, ~L1635), athlete season status and account activation.

## Validation

- Product: a coach sees the same "Starting / Bench" lineup words on the website editor as on the phone.
- Interface: Edit Team for a basketball team with starters and bench players; promote, demote and bulk-move; fill all slots to see the disabled title; switch a team's sport to trigger the toast; light and dark themes; 390px width where the bulk buttons wrap.
- System: no change to the CSV vocabulary or the API.
- Repository: `cd apps/web && npx tsc --noEmit -p .` -> exits 0 with no output.

## Stop conditions

- Stop if the roster importer's accepted values change (the import help text must keep matching them), or if the product owner prefers "Active" everywhere (then the public, athlete and mobile views change instead, as one decision).

## Design documentation

- After acceptance and validation: none (no design documentation exists in the repository).
