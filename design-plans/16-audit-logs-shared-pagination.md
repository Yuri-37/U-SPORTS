# Audit Logs pages through results with the app's shared Pagination control

Written against: 11f5963

## Evidence chain

- Surface: super-admin `/super-admin/audit` (Audit Logs), the page controls under the table. They appear when there are more than 25 entries, which is normal for a live audit trail.
- Problem: the controls are two bare text buttons, "← Prev" and "Next →", with "Page N of M" between them. They have no border, background or hover state, so they read as plain text. Every other paged list in the staff app uses the shared `Pagination` control: outlined "Previous" / "Next" buttons with chevrons and a "Showing 1–25 of N" line. That includes the Seasons page in this same super-admin portal.
- Design evidence:
  - `apps/web/src/pages/super-admin/AuditLogs.tsx` ~L375-396: `<button ... className="px-4 py-2 rounded text-sm disabled:opacity-50">← Prev</button>`, `Page {page + 1} of {Math.ceil(total / PAGE_SIZE)}`, `...Next →`.
  - Owner: `apps/web/src/components/ui/Pagination.tsx`, the default export `Pagination({ page, pageCount, total, pageSize, onPage, className })`. Its doc comment reads: "Showing 1–25 of 120" with Previous / Next. Renders nothing for a single page.
  - Consumers: `apps/web/src/pages/super-admin/Seasons.tsx` ~L473, `apps/web/src/pages/organizer/Events.tsx` ~L266, `Athletes.tsx` ~L800, `Teams.tsx` ~L1610, `Announcements.tsx` ~L359.
- Owner: `Pagination` in `apps/web/src/components/ui/Pagination.tsx`.
- Scope and affected surfaces: the Audit Logs page controls.
- Uncertainty: none. Audit Logs pages on the server, so it uses the presentational `Pagination` component directly with its own page state, not the in-memory `usePagination` hook.

## Design decision

Audit Logs renders the shared `Pagination` component in place of its hand-built buttons. The server-side paging stays as it is; only the control changes. The page index stays 0-based in state and is converted at the boundary.

## Reuse

- `Pagination` (default export of `apps/web/src/components/ui/Pagination.tsx`).
- Exemplar: `apps/web/src/pages/super-admin/Seasons.tsx` ~L473.

No new primitive is needed.

## Changes

1. `apps/web/src/pages/super-admin/AuditLogs.tsx` (~L375-396)
   - Change: replace the `{total > PAGE_SIZE && (...)}` block with `<Pagination page={page + 1} pageCount={Math.max(1, Math.ceil(total / PAGE_SIZE))} total={total} pageSize={PAGE_SIZE} onPage={(p) => setPage(p - 1)} />`. Import `Pagination`. The component already renders nothing when `total <= pageSize`.
   - Preserve: `PAGE_SIZE` (25), the fetch effect keyed on `page`, the reset to the first page when filters change, and the table.
   - Verify: with more than 25 entries the page shows "Showing 1–25 of N" and outlined Previous / Next buttons; Next loads entries 26–50; Previous is disabled on the first page and Next on the last.

## Scope

- Inherit: Audit Logs, with and without filters.
- Verify: changing a filter returns to page 1, and the "Showing" line reflects the filtered total.
- Exclude: the Dashboard's Recent Activity card (five rows, no paging) and any change to the audit API.

## Validation

- Product: a super admin pages through the audit trail with the same control they use for seasons, events and athletes.
- Interface: `/super-admin/audit` with more than 50 entries; first, middle and last pages; a filter that leaves one page (no control shown); light and dark themes; 390px width, where the control wraps.
- System: the page uses the shared `Pagination`; no hand-built page buttons remain.
- Repository: `cd apps/web && npx tsc --noEmit -p .` -> exits 0 with no output.

## Stop conditions

- Stop if `Pagination`'s props change (follow its current contract), or if Audit Logs moves to cursor-based paging without a total count (then the "Showing x of N" line cannot be filled and the design must be decided again).

## Design documentation

- After acceptance and validation: none (no design documentation exists in the repository).
