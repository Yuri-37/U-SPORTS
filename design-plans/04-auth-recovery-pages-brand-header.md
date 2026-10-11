# Password recovery pages lead with U-Sports, like the sign-in page they come from

Written against: 11f5963

## Evidence chain

- Surface: the sign-in recovery flow a visitor walks through before signing in: `/auth/login` -> "Forgot password?" -> `/auth/forgot-password`, then the emailed link -> `/auth/reset-password`, plus `/auth/accept-invite`.
- Problem: the sign-in page presents U-Sports as the product, with its own mark, and the school as a separate block below it. The next pages in the same flow put the school crest on top as the main mark, directly above the word "U-Sports", which merges the two identities that the sign-in page keeps apart.
- Design evidence:
  - Decision: `apps/web/src/pages/auth/LoginPage.tsx` ~L81-83, comment on the brand panel: "U-Sports is the product being signed in to -- the hero here, not the school's own branding (that follows below, as its own, clearly separate block, not merged into this one)."
  - Exemplar of that decision at form width: `LoginPage.tsx` ~L116-130 (the `lg:hidden` header). A row with `UsportsMark size={28}` and `<h1 className="text-2xl font-bold font-[Barlow_Condensed]">U-Sports</h1>`, then a separate `mt-4` row with the school logo (`h-6 w-auto max-w-[2rem]`) and `institution?.name` in `text-sm text-[var(--text-muted)]`.
  - Contradiction: `apps/web/src/pages/auth/ForgotPasswordPage.tsx` ~L48-57, `apps/web/src/pages/auth/ResetPasswordPage.tsx` ~L138-148 and `apps/web/src/pages/auth/AcceptInvitePage.tsx` ~L130-140 each render the school logo at `max-h-16 ... mx-auto mb-3` as the lead image, then "U-Sports", then the school name, with no `UsportsMark`.
- Owner: `apps/web/src/components/brand/UsportsMark.tsx` (the product mark) and the `LoginPage.tsx` header composition.
- Scope and affected surfaces: the brand header block (`<div className="mb-8 text-center">…</div>`) of the three recovery pages.
- Uncertainty: none.

## Design decision

The three recovery pages use the same brand header the sign-in page uses at form width: U-Sports first, with its mark; the school's logo and name below as a separate, smaller row. A visitor moving from sign-in to password recovery sees one consistent identity.

## Reuse

- `UsportsMark` from `apps/web/src/components/brand/UsportsMark.tsx`, `size={28}`
- Exemplar: `apps/web/src/pages/auth/LoginPage.tsx`, the `lg:hidden` header (~L116-130), reproduced as is without `lg:hidden`, because these pages have no side panel.

No new primitive is required by this change. If the executor finds a fifth copy of this header being added, extracting a shared `AuthBrandHeader` is the follow-up, not part of this plan.

## Changes

1. `apps/web/src/pages/auth/ForgotPasswordPage.tsx` (brand header block, ~L48-57)
   - Change: replace the logo-then-title block with the LoginPage narrow header markup (mark + "U-Sports" row; school logo + name row), keeping the `mb-8 text-center` wrapper. Import `UsportsMark`.
   - Preserve: the form, success state, copy and layout below the header.
   - Verify: the page opens with the U-Sports mark and name; the school crest and name sit below in the smaller muted row.
2. `apps/web/src/pages/auth/ResetPasswordPage.tsx` (brand header block, ~L138-148)
   - Change: same replacement.
   - Preserve: the Continue, form, expired and done states.
   - Verify: same header in every state of the page.
3. `apps/web/src/pages/auth/AcceptInvitePage.tsx` (brand header block, ~L130-140)
   - Change: same replacement.
   - Preserve: the invite form and its states.
   - Verify: same header as the other recovery pages.

## Scope

- Inherit: the three pages above.
- Verify: when the institution has no logo, the school row shows the name alone (the exemplar already handles a missing logo); and a long school name wraps without overflow at 320px.
- Exclude: `LoginPage.tsx` itself, `SuperAdminLoginPage.tsx` (the staff portal, a separate task with its own header), and any change to form behavior or copy.

## Validation

- Product: from sign-in to "Forgot password", and from a reset email to setting a new password, the visitor sees the same U-Sports identity.
- Interface: `/auth/login` (narrow width), `/auth/forgot-password` (form and sent states), `/auth/reset-password` (Continue, form, expired, done), `/auth/accept-invite`; light and dark themes; 320px, 390px and 1280px widths; institution with and without a logo.
- System: the header uses `UsportsMark` and the exemplar's classes; no new sizes or colors are introduced.
- Repository: `cd apps/web && npx tsc --noEmit -p .` -> exits 0 with no output.

## Stop conditions

- Stop if the `LoginPage.tsx` brand comment or narrow header has changed (re-derive the exemplar first), or if the product owner wants the recovery pages to keep the school as the lead mark.

## Design documentation

- After acceptance and validation: none (no design documentation exists in the repository).
