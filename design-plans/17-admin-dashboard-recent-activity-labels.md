# The dashboard's Recent Activity names actions and entity types the way Audit Logs does

Written against: 11f5963

## Evidence chain

- Surface: super-admin `/super-admin` (dashboard), the "Recent Activity" card, which shows the latest five audit log rows. The full list is `/super-admin/audit`.
- Problem: the card shows each action as lowercase words ("event status changed", "match score sheet pdf exported") and each entity type as the raw slug in a badge ("event", "team_member"). Audit Logs shows the same rows with title-cased entity badges ("Event", "Team Member"), and its Action filter names the same actions "Event Status Changed", "Match Score Sheet PDF Exported". So one audit entry is named two different ways on the two pages that show it.
- Design evidence (direct contradiction within the same task):
  - `apps/web/src/pages/super-admin/Dashboard.tsx` ~L112: `{log.action.replace(/_/g, ' ')}`; ~L117: `<Badge size="sm">{log.entity_type}</Badge>`.
  - `apps/web/src/pages/super-admin/AuditLogs.tsx` ~L31-39: `titleCase(slug)` title-cases the words and keeps `PDF`, `CSV`, `XLSX`, `OT` uppercase. Used for the entity badge (~L354, `<Badge size="sm">{titleCase(log.entity_type)}</Badge>`) and for the Action filter options (~L135-138).
- Owner: `titleCase` in `AuditLogs.tsx`, currently local to that file.
- Scope and affected surfaces: the action line and the entity badge on each Recent Activity row.
- Uncertainty: none about the labels. Two pages need the helper, so it moves to a small shared module (see Reuse).

## Design decision

Recent Activity labels the action and the entity type with the same `titleCase` the Audit Logs page uses. To share it, `titleCase` and its `ACRONYMS` list move unchanged from `AuditLogs.tsx` to `apps/web/src/lib/auditLabels.ts` (exported as `auditLabel`), and both pages import it. Badge variant and row layout stay as they are.

## Reuse

- `titleCase` / `ACRONYMS` from `apps/web/src/pages/super-admin/AuditLogs.tsx`, moved and exported as `auditLabel`.
- `Badge` (`size="sm"`), unchanged.
- Exemplar: `AuditLogs.tsx` ~L354 (entity badge) and ~L135-138 (action labels).

The shared helper exists only because exactly these two pages show audit rows. It is not a general formatter, so `formatEnumLabel` stays as it is.

## Changes

1. `apps/web/src/lib/auditLabels.ts` (new)
   - Change: move `ACRONYMS` and `titleCase` here verbatim and export the function as `auditLabel`.
   - Preserve: the exact output, including uppercase PDF/CSV/XLSX/OT.
   - Verify: `auditLabel('match_score_sheet_pdf_exported')` returns "Match Score Sheet PDF Exported".
2. `apps/web/src/pages/super-admin/AuditLogs.tsx`
   - Change: import `auditLabel` and use it wherever `titleCase` was used (`humanizeKey`, the option lists, `formatEntityId`, the entity badge); remove the local copy.
   - Preserve: every label this page renders today.
   - Verify: the filters, entity badges and "(unavailable)" fallbacks read exactly as before.
3. `apps/web/src/pages/super-admin/Dashboard.tsx` (~L112, ~L117)
   - Change: the action line renders `auditLabel(log.action)` and the badge renders `auditLabel(log.entity_type)`.
   - Preserve: the initial avatar, the timestamp, truncation and the badge size.
   - Verify: a status change shows "Event Status Changed" with an "Event" badge, the same as on Audit Logs.

## Scope

- Inherit: the Recent Activity card and the Audit Logs page.
- Verify: the Audit Logs "Action" column (a monospace code chip showing the raw action) is unchanged. It is a separate presentation and outside this plan.
- Exclude: the audit API and which actions are logged.

## Validation

- Product: a super admin recognises an entry on the dashboard by the same name they would filter for on Audit Logs.
- Interface: `/super-admin` with recent entries that include an export (PDF/CSV) and a multi-word entity (`team_member`); then `/super-admin/audit` for the same rows; light and dark themes; 390px width, where long action names truncate.
- System: one audit label helper, used by both pages.
- Repository: `cd apps/web && npx tsc --noEmit -p .` -> exits 0 with no output.

## Stop conditions

- Stop if Audit Logs changes how it labels actions or entities (follow it), or if new action names need a different acronym list (add them to `ACRONYMS` once, in the shared module).

## Design documentation

- After acceptance and validation: none (no design documentation exists in the repository).
