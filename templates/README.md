# CloudCertPrep Email Templates

HTML email templates for Supabase transactional emails. Sent from `alex@cloudcertprep.io` via Brevo SMTP.

---

## Templates

| File | Supabase Template | When Sent |
|---|---|---|
| `confirm-signup.html` | **Confirm signup** | User registers with email/password |
| `reset-password.html` | **Reset Password** | User requests password reset |
| `email-change.html` | **Change Email Address** | User updates their email address |

---

## How to Apply in Supabase

1. Go to **Supabase Dashboard** > your project > **Authentication** > **Email Templates**
2. Select the template to edit
3. Copy the full HTML from the corresponding file here
4. Paste it into the **Body** field
5. Update the **Subject line** (see below)
6. Click **Save**

### Subject Lines

| Template | Subject |
|---|---|
| Confirm signup | `Confirm your CloudCertPrep account` |
| Reset Password | `Reset your CloudCertPrep password` |
| Change Email Address | `Confirm your new CloudCertPrep email address` |

---

## Supabase Template Variables Used

| Variable | Description |
|---|---|
| `{{ .ConfirmationURL }}` | Full action URL with token (confirmation, reset) |
| `{{ .SiteURL }}` | Configured site URL (`https://www.cloudcertprep.io`), set in Auth > URL Configuration |
| `{{ .NewEmail }}` | New email address (email-change template only) |

---

## Design Notes

- **Light mode only.** Dark-mode media queries were intentionally removed: many email clients (Gmail web, Outlook desktop) ignore them, and the dual-mode CSS doubled the file size for marginal reach. Light is the safest universal baseline.
- **Premium minimal aesthetic** inspired by Linear / Vercel / Resend transactional emails: bigger H1, more whitespace around the CTA, subtle shadow on the white body card, simpler footer.
- **Header color: solid `#EA8C00`**, matching the website's light-mode `aws-orange` token (`src/index.css`). The website header uses a `#EA8C00 -> #FF7700` gradient, but emails use a solid fill because CSS gradient support is unreliable across Outlook desktop, Yahoo Mail, and older clients.
- **CTA button**: same solid `#EA8C00` as the header, with a `rgba(234,140,0,0.25)` shadow lift.
- **Accent link color** (`#EA8C00`): used for inline links, footer support email, fallback URL. Single brand color across the whole email.
- Table-based layout for maximum email client compatibility (Gmail, Apple Mail, Outlook, iOS, Android).
- All styles are inline (no external CSS, no `<style>` tags).
- Preheader hidden via `display:none + max-height:0 + mso-hide:all` to avoid SpamAssassin's `FONT_INVIS_MSGID` rule.
- Font: system font stack matching the app (`-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial`).
- Max width: 560px.

## Logo and image immutability

- Logo is hot-linked from `https://www.cloudcertprep.io/logo-email.png` (works in all modern clients; ignored by default in Outlook 2007/2010 and image-blocking proxies).
- Industry standard pattern (Stripe, Linear, Postmark, Resend all hot-link).
- **Important**: the brand wordmark "CloudCertPrep" appears as plain HTML text next to the logo, so emails are still recognizable when the image is blocked.
- **Never rename or move `public/logo-email.png` without versioning.** If you redesign, ship the new file as `logo-email-v2.png` and update templates to point at it. Old in-flight emails in users' inboxes will keep pointing at the original URL forever, so the old file must keep resolving or those emails will show a broken image.

## Copy durability and minimalism

Email copy should be **short and durable**. Three rules:

**1. Keep body paragraphs to one short sentence.** Transactional emails compete with the rest of the inbox. The H1 announces what the email is for; the button announces the action. The body paragraph just bridges them. Stripe, Linear, Vercel and Resend all use 10-15 word body paragraphs. Don't pitch features in a password-reset email.

**2. No signature line in the body.** Following Stripe, Vercel, Linear, and Postmark, transactional emails do not carry a sign-off. The footer's `Questions? Email alex@cloudcertprep.io` provides the human contact signal; a separate "Alex" or "The team" line in the body adds visual noise and looks like an unrendered template variable to non-technical readers.

**3. Don't hardcode counts or cert names.**
- Do not hardcode question counts (e.g. "1,050+ questions"). The number changes when questions are added.
- Do not write "AWS Cloud Practitioner only" framing. CloudCertPrep is a platform; emails should describe it as such.
- Personalization variables (`{{ .Email }}`, `{{ .NewEmail }}`) are fine to use; they resolve at send time.

## Footer convention

All four templates share the same footer:
- Row 1: support email link (`alex@cloudcertprep.io`)
- Row 2: `Privacy Policy · Terms of Service · GitHub` (subtle open-source signal alongside legal links)
- Row 3: copyright + AWS disclaimer

The GitHub link reinforces that CloudCertPrep is open source without polluting the body copy. Keep the link in the footer only; the body should stay focused on the email's single action.

---

## Supabase Site URL Configuration

Make sure **Authentication > URL Configuration > Site URL** is set to:
```
https://www.cloudcertprep.io
```

And **Redirect URLs** includes:
```
https://www.cloudcertprep.io/**
```

This ensures `{{ .SiteURL }}` resolves correctly and reset/confirm links redirect back to the right place.
