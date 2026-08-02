# Custom SMTP for Supabase Auth (production)

## Local Mailpit (no extra install)

Recent **Supabase CLI** versions run **Mailpit** locally for auth mail (the config block is still named `[inbucket]` for backward compatibility). You do **not** need a separate Mailpit container for normal local dev.

1. Start Docker Desktop, then from the repo root run **`pnpm supabase:start`** (`npx supabase start`), or **`supabase start`** if the CLI is on your PATH. **Wait until the command finishes** — the first run downloads large images (`Pulling …/132`); Mailpit does **not** listen on port **54324** until you see output like **`Started supabase local development setup`** and printed URLs (can take several minutes).

2. Open **http://127.0.0.1:54324** (or **http://localhost:54324**) — that is the Mailpit web UI where **local** auth emails appear (magic links, OTP, password reset). **If the browser shows "connection refused" or "can't reach this page",** the stack is still pulling/starting — leave the terminal running and try again after step 1 completes. You can confirm with **`pnpm supabase:status`** (`API URL` and services should appear).
3. Point your web app at the local API keys from `supabase status` (not the hosted project) if you want mail to hit this inbox.
4. This repo keeps `[auth.email] enable_confirmations = false` so student signups can upload COR immediately—**fewer** signup emails are sent. To exercise mail in Mailpit, use **forgot password / magic link / email OTP** flows, or temporarily set `enable_confirmations = true` in `supabase/config.toml` (then `supabase stop` and `supabase start`).

`supabase/config.toml` already enables `[inbucket]` and relaxes `[auth.rate_limit]` for local testing.

**Reverse DNS delays:** Supabase CLI already sets **`MP_SMTP_DISABLE_RDNS=true`** on the bundled Mailpit container. You only need custom env if you run a **separate** Mailpit instance yourself.

**Hosted Supabase (cloud):** Mail at `127.0.0.1:54324` only applies to **local** `supabase start`. For cloud, use **Dashboard → custom SMTP** (below) or Resend/Brevo, etc.

---

Supabase’s built-in email hits **shared rate limits**. For production, set **your own SMTP** so confirmation, magic links, and password resets use your provider’s quota.

Configuration is **only in the Supabase Dashboard** (not in this repo’s `.env`).

## Other free ways to avoid “email rate limit exceeded”

These do **not** replace production SMTP, but they cost nothing and help during development or before you wire SMTP:

1. **Wait** — Limits are time-based (often hourly). Pause signups/resends for a bit, then retry.
2. **Turn off email confirmation** — In the dashboard: **Authentication → Providers → Email → Confirm email** (disable). Far fewer auth emails are sent; users get a session immediately after sign-up (matches the student COR flow in this repo when confirmation is off). **Tradeoff:** anyone can register with any email until you add other checks.
3. **Test with one account** — Use **Authentication → Users** to delete a test user instead of creating dozens of new signups. Avoid hammering “Resend confirmation.”
4. **Local Supabase** — With Docker, `supabase start` runs **Mailpit** (config key `[inbucket]`) so dev auth mail is captured at **http://127.0.0.1:54324** and never hits cloud quotas. Your hosted project still has separate limits.
5. **Custom SMTP free tier** — [Resend](https://resend.com), [Brevo](https://www.brevo.com), etc. (below) are free within their caps and remove reliance on Supabase’s shared mail quota.

## Where to configure

1. Open [Supabase Dashboard](https://supabase.com/dashboard) → your project.
2. **Project Settings** (gear) → **Authentication**.
3. Find **SMTP Settings** (or **Auth** → **SMTP** depending on UI version).
4. Enable custom SMTP and fill in host, port, user, password, **Sender email**, **Sender name**.
5. Save. Send a test signup or “Forgot password” to confirm delivery.

Use **port 587** with **TLS/STARTTLS** unless your provider says otherwise (some use **465** + SSL).

## Free / cheap providers (pick one)

Limits change often — always confirm on the provider’s pricing page.

| Provider | Notes |
|----------|--------|
| **[Resend](https://resend.com)** | Strong DX, good free tier for transactional mail. Add/verify a domain (or use their test flow). Good default choice. |
| **[Brevo](https://www.brevo.com)** (ex-Sendinblue) | Free transactional tier with daily caps. Verify sender/domain per their docs. |
| **[SendGrid](https://sendgrid.com)** | Free tier with a daily send cap. Domain authentication recommended. |
| **[Mailjet](https://www.mailjet.com)** | Free tier with monthly limits. |

**Avoid relying on raw Gmail “App password”** for production: low limits, spam risk, and Google may block automated sends.

## Typical field mapping

After you create an **SMTP user/API key** with the provider:

- **Host** — e.g. `smtp.resend.com`, `smtp-relay.brevo.com`, `smtp.sendgrid.net` (use **their** docs).
- **Port** — usually `587`.
- **Username / password** — from the provider (sometimes the username is `apikey` and the password is a long API key).
- **Sender email** — must be a domain/address **allowed** by that provider (verified sender or domain).
- **Sender name** — e.g. `U-Sports` or your school name.

## DNS

For production, add the provider’s **SPF**, **DKIM**, and any **DMARC** records they give you. Improves deliverability so school inboxes don’t mark auth mail as spam.

## Local development (`config.toml`)

See **[Local Mailpit (no extra install)](#local-mailpit-no-extra-install)** above. Hosted Supabase still uses Dashboard SMTP only.
