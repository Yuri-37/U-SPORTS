# The Events "Completed" tab uses the same word as the status badges it lists

Written against: 11f5963

## Evidence chain

- Surface: `/organizer/events` (organizer and super-admin event list), status tabs above the event cards.
- Problem: the tab that lists finished events is labelled "Completed", but every event card it lists carries the status badge "Finished". The same status is named two ways on one screen: in the tab a person picks and on the badge of each result.
- Design evidence (direct contradiction on the same screen):
  - `apps/web/src/pages/organizer/Events.tsx` L146-149: tabs include `{ id: 'completed', label: 'Completed' }`; the filter at L94 keeps only `e.status === 'completed'` for that tab.
  - Same file L248-249: each card shows `<Badge variant={STATUS_VARIANTS[e.status]} size="sm">{organizerEventStatusLabel(e.status)}</Badge>`.
  - `apps/web/src/lib/utils.ts` `organizerEventStatusLabel` (commented "Organizer-facing status badges"): `completed` returns `'Finished'`.
  - The event page uses the same word for the action that produces this status: `apps/web/src/pages/organizer/EventDetail.tsx` button "Mark finished", and its header badge also uses `organizerEventStatusLabel` ("Finished").
- Owner: `organizerEventStatusLabel` in `apps/web/src/lib/utils.ts`.
- Scope and affected surfaces: the tab label, and the empty-state hint on the same page that names the tabs (L206: "Try Active, Completed, Cancelled, or All — your events may be under another filter.").
- Uncertainty: none.

## Design decision

Rename the tab "Finished", the word the organizer-facing status owner, the card badges and the "Mark finished" action already use. The tab id `completed` and which events it shows stay unchanged; only visible text changes.

## Reuse

- `organizerEventStatusLabel('completed')` from `apps/web/src/lib/utils.ts` (returns "Finished"); the tab label calls it so the tab and the badge cannot drift apart again.
- Exemplar: `apps/web/src/pages/organizer/EventDetail.tsx` header badge and "Mark finished" button.

No new primitive is needed.

## Changes

1. `apps/web/src/pages/organizer/Events.tsx` (TabBar tabs, ~L146-149)
   - Change: the `completed` tab's label becomes `organizerEventStatusLabel('completed')`, rendering "Finished". The function is already imported in this file.
   - Preserve: tab ids (`active`, `completed`, `cancelled`, `all`), tab order, the default tab, and the filter at ~L92-95.
   - Verify: the tabs read "Active, Finished, Cancelled, All"; selecting "Finished" lists cards badged "Finished".
2. `apps/web/src/pages/organizer/Events.tsx` (empty-state description, ~L206)
   - Change: the hint reads "Try Active, Finished, Cancelled, or All — your events may be under another filter."
   - Preserve: the other empty-state branches and the "Clear filters" action.
   - Verify: with no events in the current tab and no search or sport filter, the hint names the tabs exactly as they appear.

## Scope

- Inherit: the organizer and super-admin Events list.
- Verify: the guest Events page (`/guest/events`, "Upcoming" and "Past results") and public event badges, which use `eventPublicLifecycleLabel`, are unaffected.
- Exclude: match statuses ("Completed" in an event's Matches tab describes a match, not an event), season statuses, and any change to which events each tab shows.

## Validation

- Product: an organizer looking for a finished event picks the tab whose name matches the badge on that event.
- Interface: `/organizer/events` with events in each status; check every tab, the empty state of the Finished tab, light and dark themes, and a 390px viewport where the tab bar scrolls.
- System: the tab label comes from `organizerEventStatusLabel`, not a new string constant.
- Repository: `cd apps/web && npx tsc --noEmit -p .` -> exits 0 with no output.

## Stop conditions

- Stop if `organizerEventStatusLabel('completed')` no longer returns "Finished", or if the product owner decides the organizer-facing word should be "Completed" (then change `organizerEventStatusLabel` and the "Mark finished" action together, as one decision, instead of this tab).

## Design documentation

- After acceptance and validation: none (no design documentation exists in the repository).
