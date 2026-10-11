# The hub's Recent champions cards call a finished event "Finished", like every other public event badge

Written against: 11f5963

## Evidence chain

- Surface: public hub `/guest` (also the signed-out home), section "Recent champions". Each card links to the event page `/guest/events/:slug`.
- Problem: every champion card carries a green badge reading "Completed". A visitor who opens that card lands on the event page, where the same event's badge reads "Finished". The Events page's "Past results" tab labels the same events "Finished" too. One event status has two public names, one click apart.
- Design evidence (direct contradiction within the same task):
  - `apps/web/src/pages/guest/Hub.tsx` ~L619-621: `<Badge variant="success" size="sm">Completed</Badge>`, hard-coded. The section only lists completed events.
  - The same page's Events cards use the public owner: `Hub.tsx` ~L493-494, `{eventPublicLifecycleLabel(e.status)}`.
  - `apps/web/src/lib/utils.ts` `eventPublicLifecycleLabel('completed')` returns "Finished". It is used by the event page header (`apps/web/src/pages/EventDetailPage.tsx` ~L226) and the guest Events cards (`apps/web/src/pages/guest/Events.tsx` ~L121).
  - The Android app uses the same owner and the same word: `mobile/lib/utils/format_helpers.dart` `eventPublicLifecycleLabel` ('completed' -> 'Finished'), used by `mobile/lib/widgets/event_card.dart` ~L124.
- Owner: `eventPublicLifecycleLabel` in `apps/web/src/lib/utils.ts`.
- Scope and affected surfaces: the badge on each Recent champions card.
- Uncertainty: none.

## Design decision

The champion card badge renders `eventPublicLifecycleLabel('completed')`, so it reads "Finished", the word every other public event badge uses for this status on web and mobile. The `success` variant stays.

## Reuse

- `eventPublicLifecycleLabel` from `apps/web/src/lib/utils.ts` (already imported in `Hub.tsx`).
- Exemplar: `apps/web/src/pages/guest/Hub.tsx` ~L493-494 (Events cards on the same page).

No new primitive is needed.

## Changes

1. `apps/web/src/pages/guest/Hub.tsx` (~L619-621, Recent champions card)
   - Change: the badge text becomes `{eventPublicLifecycleLabel('completed')}` instead of the literal "Completed".
   - Preserve: `variant="success"`, `size="sm"`, the sport icon, the featured middle card treatment, and the champion and runner-up lines.
   - Verify: every Recent champions card shows a green "Finished" badge, matching the badge on the event page it opens.

## Scope

- Inherit: the Recent champions section of the hub.
- Verify: the hub's Events cards and Live games cards are unchanged.
- Exclude: match statuses ("Completed" on a match row describes a match, not an event), staff pages (`organizerEventStatusLabel`), and the Android app (its champion rows show no status badge).

## Validation

- Product: a visitor sees the same word for a finished competition on the hub, the Events archive and the event page.
- Interface: `/guest` with at least three completed events that have a final; check the featured middle card at desktop width, the single column at 390px, and light and dark themes; open one card and compare its event page badge.
- System: the badge text comes from `eventPublicLifecycleLabel`.
- Repository: `cd apps/web && npx tsc --noEmit -p .` -> exits 0 with no output.

## Stop conditions

- Stop if `eventPublicLifecycleLabel('completed')` no longer returns "Finished", or if the Recent champions section starts listing events in other statuses (then pass each event's own status instead of the constant).

## Design documentation

- After acceptance and validation: none (no design documentation exists in the repository).
