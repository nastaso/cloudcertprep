# Email templates (auth + marketing)

Source of truth for the transactional auth emails (Supabase Auth) and a reusable
marketing template. Supabase auth templates live only in the dashboard, so these
files are the versioned source (same drift problem as the DB schema in
`supabase/README.md`, which is why they sit next to it). Edit here, commit, then
paste into the dashboard. They contain no secrets.

These are brand-coherent with DSv6: white card on the `#F8F9FA` light page, the
v6 palette, the two-tone wordmark ("Cloud" 500 / "CertPrep" 700) matching the
header, and the single orange (`#EA8C00`, the light-surface dual-orange value)
used ONLY on the primary button. The email body is intentionally LIGHT, not the
dark stage: dark bodies render unpredictably in Outlook / Gmail dark mode and
trip spam heuristics.

## Logo

The templates link the **`logo-email-v2.png`** mark (white rounded tile + orange
cloud + **ink check**). The white tile is deliberate (Outlook / dark-client
compat). The ink check matches the header and the favicon/app icons (the
canonical check flipped from white to ink on 2026-06-13). It is a NEW file:
`public/logo-email.png` (the old white-check mark) is hot-linked by every email
already sent, so that URL must keep resolving forever. Regenerate the v2 mark
with `npm run icons`. Never overwrite either file in place; if the mark changes
again, ship `logo-email-v3.png`.

## Files -> Supabase dashboard map

Authentication > Emails > (template) > Message (HTML). Set the subject too.

| File | Dashboard template | Suggested subject | Active in app today? |
|------|--------------------|-------------------|----------------------|
| `confirm-signup.html` | Confirm signup | Confirm your CloudCertPrep email | YES (email signup) |
| `reset-password.html` | Reset password | Reset your CloudCertPrep password | YES (forgot password) |
| `magic-link.html` | Magic Link | Your CloudCertPrep sign-in link | No (password + OAuth only) |
| `change-email.html` | Change Email Address | Confirm your new CloudCertPrep email | No (no in-app email change yet) |
| `invite.html` | Invite user | You're invited to CloudCertPrep | No (admin-only invite) |
| `reauthentication.html` | Reauthentication | Your CloudCertPrep verification code | No (no secure-action reauth yet) |

The two flows the public app triggers today are **Confirm signup** and **Reset
password** (`src/pages/_Login.tsx` `signUp` + `resetPasswordForEmail`). The other
four are shipped so the dashboard is fully branded if those flows are turned on
later; paste them now so nothing is ever sent with Supabase's default styling.

A matching `*.txt` plain-text version sits beside each HTML file (see "Plain
text" below).

## Supabase template variables

Go-template variables, substituted by GoTrue at send time:

- `{{ .ConfirmationURL }}` - the full action link (confirm / reset / invite /
  magic-link / change-email). Already carries the redirect from the Site URL +
  the Redirect URLs allowlist; the template does not build URLs itself.
- `{{ .Token }}` - 6-digit one-time code (Reauthentication; also available on
  OTP flows).
- `{{ .TokenHash }}` - hashed token, for building a custom verify URL if needed.
- `{{ .SiteURL }}` - the configured Site URL.
- `{{ .Email }}` / `{{ .NewEmail }}` - current / new address (Change Email).

The reset link resolves to `/reset-password` (the app passes
`redirectTo: <origin>/reset-password`), so that path MUST be in the Supabase
Redirect URLs allowlist for prod AND the dev branch-deploy origin (coordinate
with security hardening + the host migration).

## Plain text

The Supabase dashboard exposes only an HTML body per template, so the `*.txt`
files are NOT pasted there. They exist for:
1. documentation / review of the copy without HTML noise;
2. a drop-in text part if delivery moves to an ESP API (Resend / Postmark / SES)
   that sends real `multipart/alternative` (HTML + text).

Deliverability note: an HTML-only email earns the SpamAssassin `MIME_HTML_ONLY`
hit. GoTrue + custom SMTP sends HTML only, so expect that one minor hit on
mail-tester. To clear it, send via an ESP API that takes both parts (using the
`*.txt` here as the text part). It is a small penalty; the DNS auth below matters
far more for the score.

## Deliverability checklist (OWNER - Alex)

A perfect template still lands in spam without sending-domain auth. mail-tester
scores SpamAssassin rules + SPF/DKIM/DMARC. To hit ~10/10:

> **Current setup:** cloudcertprep.io sends through **Brevo**, wired as Supabase's
> **custom SMTP relay**. Supabase still renders these templates (they are pasted in
> the dashboard, see the map above) and hands each message to Brevo for delivery.
> The steps below describe that pattern generically so a fork can use any provider;
> credentials live only in the Supabase dashboard, never in this repo.

1. **Custom SMTP on a verified domain.** Supabase's built-in email is shared
   and rate-limited and you cannot fully control its SPF/DKIM/DMARC. Use a
   provider (here: Brevo; alternatives SES / Postmark / Resend).
   Authentication > Emails > SMTP Settings -> enter the provider host/port/user/
   pass; set Sender name `CloudCertPrep` and Sender email
   `no-reply@cloudcertprep.io` (or a verified sending subdomain).
2. **DNS auth on that domain, all passing:**
   - **SPF** TXT authorizing the provider's sending hosts.
   - **DKIM** CNAME/TXT keys from the provider, verified.
   - **DMARC** TXT, e.g. `v=DMARC1; p=quarantine; rua=mailto:dmarc@cloudcertprep.io`
     (start `p=none` to monitor, then tighten).
3. **From / Reply-To:** valid `From:` on the domain; a working `Reply-To`
   (these templates invite a reply to `alex@cloudcertprep.io`).
4. **Redirect URLs allowlist** includes `/reset-password` and the prod origin
   (and the dev origin while testing) so links resolve, not 400.
5. **Rate limits:** raise the Auth email rate limit from the built-in default
   once custom SMTP is set, or signup confirmations throttle.
6. **Test:** send each template to the address mail-tester.com gives you, read
   the report, iterate. Expect SPF/DKIM/DMARC = pass and no major content hits;
   the only likely residual is `MIME_HTML_ONLY` (see "Plain text").

Owner actions are tracked in `.kiro/ship-v2/08-owner-action-items.md`.

## Legal

- **Transactional (the auth emails):** exempt from CAN-SPAM's unsubscribe
  requirement (they are user-initiated account actions), so they carry no
  unsubscribe. They still keep a truthful `From`/subject, sender identity, and a
  real reply path - all present.
- **Marketing (`marketing-template.html`):** any promotional send MUST carry
  (CAN-SPAM + GDPR/PECR):
  - a working **one-click unsubscribe** (`{{ unsubscribe_url }}`) honored
    promptly, plus the `List-Unsubscribe` and `List-Unsubscribe-Post:
    List-Unsubscribe=One-Click` headers set at send time;
  - a truthful `From`, sender identity, and non-deceptive subject;
  - a **physical postal address** (`{{ company_address }}`);
  - send only to recipients with a **lawful basis** (opt-in consent for
    GDPR/PECR). No pre-checked boxes; record when/how consent was given.

## Testing the templates

- **Render:** paste into the dashboard and use Supabase's preview, or send a real
  test to yourself. Check Gmail (web + app), Apple Mail, and Outlook, in light
  AND dark mode. The MSO `<v:roundrect>` keeps the button a pill in Outlook
  desktop; everywhere else the CSS `border-radius` pill applies.
- **Images off:** with images blocked, the two-tone text wordmark still carries
  the brand and every CTA is a styled text link (the logo `alt` is intentionally
  empty so it does not double-read the adjacent wordmark).
- **Links:** confirm `{{ .ConfirmationURL }}` resolves to the right redirect and
  is not flagged (no URL shorteners are used).
