# 36 — Leaderboards: the stats table and team rankings reveal on scroll

- **Status**: TODO
- **Commit**: c5ef129
- **Severity**: LOW
- **Category**: Missed opportunities
- **Estimated scope**: 1 file (`apps/web/src/pages/guest/Leaderboards.tsx`), about 6 changed lines
- **Depends on**: plan 33
- **Mobile counterpart**: plan 39 (Rankings tab, sport detail)

## Problem

`/guest/leaderboards` has no entrance, while the hub's "Browse by sport" tiles that link here do. The page holds two kinds of content:

```tsx
// apps/web/src/pages/guest/Leaderboards.tsx:216 — current (Player Stats tab)
<div className="overflow-x-auto rounded-xl border border-[var(--border-subtle)]">
  <table className="w-full text-sm">…</table>
</div>
```

```tsx
// apps/web/src/pages/guest/Leaderboards.tsx:302-306 — current (Team Rankings tab)
<Card
  key={ts.id}
  className="flex items-center gap-4 cursor-pointer hover:border-[var(--accent-default)]/40 transition-colors"
  onClick={() => ts.team?.id && navigate(`/guest/teams/${ts.team.id}`)}
>
```

## Target

- **Player Stats.** The table container reveals as one `card` block. Rows do not reveal one by one, for two reasons:
  - A stats table is scanned across and down, and rows rising individually would make it harder to read while scrolling.
  - The Android app's player table is a `DataTable`, whose rows cannot be animated separately. Revealing the whole table keeps both platforms the same.
- **Team Rankings.** Each team card uses `reveal.row` (4px, 200ms, 20ms step). They form a ranked list, and the app's team rows use the same kind.
- **Interaction.** Changing sport, season or tab, or typing in "Search athletes", happens after the visitor's first input, so on-screen content shows instantly (plan 33, rule 4). The table container is never remounted by these changes (only its `tbody` contents change), so it reveals once per visit.
- **Not animated**: the header, the sport pills, the season pickers, the tab bar and the loading placeholders.

## Steps

1. Import `useScrollReveal` from `'../../hooks/useScrollReveal'`.
2. In the component, directly after `const navigate = useNavigate()`, add `const reveal = useScrollReveal()`.
3. Line 216: add `ref={reveal.card}` to `<div className="overflow-x-auto rounded-xl border border-[var(--border-subtle)]">`.
4. Line 302: add `ref={reveal.row}` to the team `<Card key={ts.id} …>`.

## Boundaries

- Do NOT put refs on `<tr>` elements.
- Do NOT change sorting, filtering or the "Loading rankings…" text.
- If the table is no longer wrapped in that `div`, STOP and report.

## Verification

- **Mechanical**: `cd apps/web && npx tsc --noEmit -p tsconfig.app.json` is clean.
- **Feel check**:
  - Open `/guest/leaderboards` from the hub's Basketball tile. The table fades up 8px once the data loads.
  - Switch sport. The table updates in place with no entrance.
  - Open Team Rankings. The teams on screen show at once, because the tab click counts as input. Teams further down rise 4px as you scroll.
  - Reload with `?sport=volleyball` and go straight to Team Rankings with the keyboard. On-screen cards show instantly, and scrolled ones reveal.
  - Emulate `prefers-reduced-motion: reduce`. Nothing moves.
- **Done when**: the table container uses `card`, team cards use `row`, and nothing else on the page animates.
