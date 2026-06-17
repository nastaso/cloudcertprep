# Security Policy

Thanks for taking the time to look at the security of CloudCertPrep.

## Supported versions

Only the version currently deployed at [cloudcertprep.io](https://www.cloudcertprep.io) and the `main` branch of this repository are supported. Older branches and tags are not patched.

## Reporting a vulnerability

**Please do not file a public GitHub issue for security problems.**

Instead, email me directly:

- **Contact:** [alex@cloudcertprep.io](mailto:alex@cloudcertprep.io)
- **Subject prefix:** `[security]`

Include in the report:

1. A description of the issue and the impact you believe it has.
2. Step-by-step reproduction (URLs, payloads, account state).
3. The affected component or page if you can identify it.
4. Optionally, suggested mitigation.

## What to expect

- I will acknowledge your report within **5 working days**.
- I will keep you informed about the fix progress.
- I will credit you in the release notes when the fix ships, unless you ask not to be named.
- I will let you know when you can publicly disclose the issue (usually after a fix is deployed).

## What is in scope

- The production site `cloudcertprep.io` and any subdomains.
- The contents of this GitHub repository, including the email templates, CI workflows, and database SQL surfaced in documentation.
- Authentication and session handling via Supabase.
- Cross-site scripting, SQL injection, privilege escalation, data exposure, or anything that could let one user read or modify another user's data.

## What is out of scope

- Social engineering of the maintainer.
- Denial-of-service attacks against the live site.
- Issues in third-party services (Supabase, Netlify, Brevo, Google Analytics, Umami) that are not specific to how CloudCertPrep configures them.
- Missing security headers that do not lead to a concrete exploit.
- Theoretical issues without a working proof-of-concept.

## No bug bounty

CloudCertPrep is a free, open-source side project with no revenue. I cannot pay for vulnerability reports. I will credit you publicly (with your permission) and thank you sincerely, but please do not expect financial compensation.

## Authentication providers and PII

CloudCertPrep uses Supabase Auth. The providers in use, and the personal data
each one supplies to the platform:

| Provider | PII received |
|---|---|
| Email + password | Email address. Passwords are handled and hashed by Supabase; never visible to application code. |
| Google OAuth | Email address, display name, and avatar URL from the Google profile (brokered entirely by Supabase; no Google credentials or tokens are handled by application code). |
| GitHub OAuth | Email address, username, and avatar URL from the GitHub profile (brokered entirely by Supabase; no GitHub credentials or tokens are handled by application code). |

Beyond auth identity, the platform stores only exam-activity data keyed to the
user id (attempts, per-question answers, domain mastery). No payment data, no
address, no phone number. Sign-ups are protected by Cloudflare Turnstile; the
captcha token is verified server-side by Supabase.

## Security model summary

CloudCertPrep is an Astro static site (prerendered pages + React islands) backed by Supabase Postgres:

- All Supabase tables that contain user data have **Row Level Security (RLS)** enabled with the policy `auth.uid() = user_id`.
- The Supabase **anon key** is intentionally public (inlined into the browser bundle). Security is enforced server-side via RLS, not by hiding the key.
- The **service role key** is never present in any client code, repository, or build output.
- Aggregate community statistics are exposed via a `SECURITY DEFINER` RPC that returns only aggregates, never raw rows.
- The `question_mastery` view uses `SECURITY INVOKER` so that RLS on the underlying table is enforced when the view is queried.

Reports demonstrating that any of these assumptions are wrong are particularly welcome.
