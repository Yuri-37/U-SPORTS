# 34 — Hub: cards reveal as they scroll into view

- **Status**: TODO
- **Commit**: c5ef129
- **Severity**: MEDIUM
- **Category**: Missed opportunities (also fixes the missing hover lift on hub cards)
- **Estimated scope**: 1 file (`apps/web/src/pages/guest/Hub.tsx`), about 15 changed lines
- **Depends on**: plan 33 (`useScrollReveal`, the `[data-reveal]` CSS, `Card` `ref`)
- **Mobile counterpart**: plan 38 (Home)

## Problem

The hub (`/guest`, also the signed-out home) staggers in five card groups with `.stagger`, which plays on mount. Every group below the fold has finished animating before the visitor scrolls to it:

| Section | Line | Current |
| --- | --- | --- |
| Live games | 330 | `<div className="grid sm:grid-cols-2 gap-6 stagger">`, children are `<Card key={m.id} …>` |
| Events | 484 | `<div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6 stagger">`, children are `<Card key={e.id} …>` |
| Browse by sport | 515 | `<div className="grid gap-6 lg:grid-cols-3 lg:grid-rows-2 stagger">`, children are `<Card key={s.sport} interactive …>` |
| Stats band | 586 | `<div className="grid grid-cols-2 lg:grid-cols-4 gap-y-12 lg:divide-x lg:divide-white/20">` holding four `<StatCell>` (no animation) |
| Recent champions | 604 | `<div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 stagger">`, children are `<div key={ev.id}>` wrappers around a `Card` |
| Closing CTA | 678 | `<div className="relative max-w-3xl mx-auto px-6 py-24 lg:py-32 text-center">` (no animation) |

Because `.stagger` fills `transform`, the Live games, Events and sport-tile cards also never get `.card-lift`'s hover rise (see plan 33, Problem).

## Target

Every group reveals when it reaches the viewport, using `reveal.card` (8px, 300ms, 40ms batch stagger):

- **Live games, Events, sport tiles**: each `Card` gets `ref={reveal.card}`, and the grid drops `stagger`.
- **Recent champions**: the `<div key={ev.id}>` wrapper gets `ref={reveal.card}`, not the inner `Card`, because the featured `Card` carries `lg:-translate-y-6`. The grid drops `stagger`.
- **Stats band**: the four-cell grid reveals as one block (`ref={reveal.card}` on the grid `div`). Four figures rising separately on a coloured band would be busier than the rest of the page. `StatCell` is shared with App Details and stays unchanged.
- **Closing CTA**: the inner `max-w-3xl` block reveals as one block.
- **Hero**: keeps its page-load `animate-fade-in-up` (line 275). It is always on screen at load.
- **Section headings** (`SectionHeading`): do not animate. They anchor each section while its cards arrive. Mobile `SectionHeader`s don't animate either.

Behaviour that follows from plan 33's rules:

- At load, the cards already on screen cascade like before (0, 40, 80… ms).
- A live game that appears after the visitor has clicked or pressed a key shows instantly, and one that appears before any input fades in.
- Scores updating inside an already revealed card never replay the entrance, because the `Card` keys (`m.id`) keep the same DOM node.

## Steps

1. Add the import next to the other hooks:

   ```ts
   import { useScrollReveal } from '../../hooks/useScrollReveal'
   ```

2. In `GuestHub()`, directly after `const navigate = useNavigate()` (about line 58), add:

   ```ts
   const reveal = useScrollReveal()
   ```

3. **Live games** (line 330):
   - Change the class to `grid sm:grid-cols-2 gap-6` (drop `stagger`).
   - On the `<Card key={m.id} …>` at line 334, add `ref={reveal.card}`.
4. **Events** (line 484):
   - Change the class to `grid sm:grid-cols-2 lg:grid-cols-3 gap-6` (drop `stagger`).
   - On `<Card key={e.id} …>`, add `ref={reveal.card}`.
5. **Browse by sport** (line 515):
   - Change the class to `grid gap-6 lg:grid-cols-3 lg:grid-rows-2` (drop `stagger`).
   - On `<Card key={s.sport} interactive …>`, add `ref={reveal.card}`.
6. **Stats band** (line 586): on the grid `div`, add `ref={reveal.card}`. Leave `StatCell` untouched.
7. **Recent champions** (line 604):
   - Change the class to `grid gap-6 sm:grid-cols-2 lg:grid-cols-3` (drop `stagger`).
   - Add `ref={reveal.card}` to both wrappers: the featured `<div key={ev.id} className="rounded-xl p-[2px] lg:mb-0" …>` (about line 650) and the plain `<div key={ev.id}>{body}</div>` (about line 660).
8. **Closing CTA** (line 678): on `<div className="relative max-w-3xl mx-auto px-6 py-24 lg:py-32 text-center">`, add `ref={reveal.card}`.

## Boundaries

- Do NOT touch the hero (`animate-fade-in-up`, ring spin, float cards), the live-match `Modal`, the skeletons or the empty messages.
- Do NOT put the ref on the champion `Card` itself; it goes on the wrapper (`translate` clash, see Target).
- Do NOT edit `components/marketing/Section.tsx` or `AppDetails.tsx`.
- If a grid no longer carries `stagger` or the children differ from the table above, STOP and report rather than guess.

## Verification

- **Mechanical**:
  - `cd apps/web && npx tsc --noEmit -p tsconfig.app.json` is clean.
  - `grep -n "stagger" apps/web/src/pages/guest/Hub.tsx` returns nothing.
- **Feel check** (`/guest`, desktop 1440×900 and phone 390×844):
  - Hard reload. The hero settles as before, and the Events cards on screen cascade in within about half a second.
  - Scroll down slowly. Sport tiles, the stats band, champions and the closing block each fade up about 8px as they pass a line a little above the bottom edge, then never move again when scrolled past or back.
  - Hover an Events card or a sport tile on desktop. It now rises 4px (the hover lift works again).
  - With a live match running, click anywhere and wait for a new live game to appear. It shows with no entrance.
  - Scroll to the very bottom on a short window (1440×600). The closing block is visible, not stuck invisible.
  - DevTools → Rendering → emulate `prefers-reduced-motion: reduce`, then reload. Everything is visible at once and nothing moves.
- **Done when**: no `stagger` remains in `Hub.tsx`, and the six groups listed in Target reveal on scroll, once.
