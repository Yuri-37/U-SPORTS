# The public event Matches tab says "Waiting for teams" for TBD matches, like the Android app and the staff event page

Written against: 11f5963

## Evidence chain

- Surface: the shared event page `EventDetailPage` -> Matches tab. It is served at `/guest/events/:slug` (public) and `/athlete/events/:id` (athlete).
- Problem: a later-round match whose teams are not decided yet reads "TBD vs TBD" with a grey "Scheduled" badge, the same badge as a match that is ready to play. On the Android app the same row says "Waiting for teams", and the staff event page uses that same phrase for this state.
- Design evidence:
  - `apps/web/src/pages/EventDetailPage.tsx` ~L261-266 sets `labelA`/`labelB` to "TBD" when `participant_a_id`/`participant_b_id` is missing. The badge at ~L296-306 renders `{m.status === 'live' ? '● LIVE' : formatEnumLabel(m.status)}`, which gives "Scheduled" for these matches.
  - Shared web/mobile feature, mobile wording: `mobile/lib/screens/event_detail_screen.dart` `_matchRow` (~L478-485): `final waiting = st == 'scheduled' && (idA == null || idB == null);`, subtitle `waiting ? 'Waiting for teams' : matchStatusLabel(st)`.
  - Web staff wording for the same state: `apps/web/src/pages/organizer/EventDetail.tsx` ~L923-930, "Waiting for teams" with a `Hourglass` icon, shown when a scheduled or live match has a missing participant.
- Owner: the match status badge in `EventDetailPage.tsx`.
- Scope and affected surfaces: the status badge text on Matches tab rows for scheduled matches with a missing participant.
- Uncertainty: none. Other statuses keep their current text.

## Design decision

When `m.status === 'scheduled'` and either participant id is missing, the row's badge reads "Waiting for teams" (default variant, `size="sm"`). Every other match keeps its current badge.

## Reuse

- `Badge` (`size="sm"`, default variant), as the row already uses.
- Exemplars: the "Waiting for teams" text in `apps/web/src/pages/organizer/EventDetail.tsx` ~L929 and in `mobile/lib/screens/event_detail_screen.dart` ~L485.

No new primitive is needed. The organizer page's `Hourglass` icon is optional; if added, use `w-3 h-3` as the staff page does.

## Changes

1. `apps/web/src/pages/EventDetailPage.tsx` (Matches tab badge, ~L296-306)
   - Change: compute `waiting = m.status === 'scheduled' && (!m.participant_a_id || !m.participant_b_id)`. When `waiting` is true, the badge text is "Waiting for teams"; otherwise it keeps the current expression.
   - Preserve: the badge variants, the "● LIVE" text and Watch button for live matches, the row layout, and opening the match sheet.
   - Verify: on a single-elimination event in progress, the final reads "TBD vs TBD" with "Waiting for teams"; first-round matches with both teams still read "Scheduled".

## Scope

- Inherit: the public event page and the athlete event page (both render `EventDetailPage`).
- Verify: the Bracket tab and `PublicMatchDetailModal` are unchanged.
- Exclude: whether a TBD row can be tapped (behavior, not part of this change), the organizer event page, and the Android app (already correct).

## Validation

- Product: a visitor can tell a match that is waiting for earlier results from one that is about to be played, using the same words as the phone app.
- Interface: `/guest/events/:slug` for an in-progress elimination event with TBD later rounds, plus a finished event (no TBD rows); light and dark themes; 390px width, where the badge moves below the teams.
- System: the badge uses the same `Badge` and only changes its text for that state.
- Repository: `cd apps/web && npx tsc --noEmit -p .` -> exits 0 with no output.

## Stop conditions

- Stop if the matches endpoint begins resolving TBD participants from the bracket before returning them (then use the same resolved ids the labels use), or if the Android wording changes (follow it).

## Design documentation

- After acceptance and validation: none (no design documentation exists in the repository).
