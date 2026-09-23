# Shared memo

One private board for two people. A quiet, Apple-inspired list with **Pending**, **Waiting**, and **Done**. The owner edits; the other person opens a private link.

## Included

- Inline task and board-title editing, short notes, assignment to Leo or James.
- Add, delete, complete, reopen, move between sections, drag to reorder, and accessible move-up/down controls.
- Completed items automatically leave the main board after 24 hours. They remain in an owner-only archive and can be reopened; viewers never receive archived tasks. No scheduled jobs or destructive deletion.
- Collapsible Done section, mobile layout, keyboard support, reduced-motion support.
- Supabase magic-link owner sign-in, a 256-bit viewer token stored only as a SHA-256 hash in PostgreSQL, and a Secure/HttpOnly/SameSite viewer cookie.
- Automatic updates every eight seconds while visible, plus refresh when returning to the tab. No notifications, accounts for viewers, analytics, or third-party scripts.
- PostgreSQL RLS and narrow database grants; the app requires **no service-role key**.

## Run the design preview

Requires Node 24 and pnpm 11.

```sh
pnpm install
ENABLE_PREVIEW=true pnpm dev
```

Open `/preview` to try editing or `/preview?view=reader` to see the read-only version. The preview uses sample data in memory, makes no database calls, and does not save changes. It is disabled unless `ENABLE_PREVIEW=true`. The real `/` and `/view` routes never fall back to sample data.

## Activate the private app

1. Create a dedicated Supabase project. Run `supabase/migrations/001_shared_memo.sql` in its SQL editor.
2. In Authentication, create the single owner user without sending an invitation; mark the email confirmed. Disable public sign-ups. Keep email authentication enabled. Configure SMTP for reliable magic-link delivery; the default Supabase mail service may only deliver to authorized project addresses.
3. Replace `OWNER_EMAIL_HERE` in `supabase/seed.sql` and run it once. This creates one empty board owned by that Supabase user. The singleton constraint prevents multiple boards.
4. Import this repository into Vercel as a Next.js project. Set Node 24. Configure these server-side environment variables (none use `NEXT_PUBLIC_`):

   | Variable                   | Value                                                        |
   | -------------------------- | ------------------------------------------------------------ |
   | `SUPABASE_URL`             | Supabase project's HTTPS API URL                             |
   | `SUPABASE_PUBLISHABLE_KEY` | Publishable key or legacy anon key, never a service-role key |
   | `OWNER_EMAIL`              | Exact sole-owner email used in step 3                        |
   | `APP_ORIGIN`               | The canonical deployed HTTPS origin, with no trailing slash  |
   | `ENABLE_PREVIEW`           | `false`                                                      |

5. In Supabase Auth URL Configuration, set Site URL to `APP_ORIGIN`, and allow `APP_ORIGIN/auth/confirm` as a redirect URL. Replace the Magic Link email's link target with:

   ```html
   <a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email"
     >Open your private memo</a
   >
   ```

6. Deploy. Sign in at `/login`. Use the share icon to create and copy the viewer link. Do not put the viewer link or a token into GitHub, deployment variables, or this README.

Vercel must allow anonymous access to the production app shell so the recipient can reach `/view`; application authorization still blocks all board data without a valid token or owner session. Preview deployment protection can remain enabled. GitHub Pages cannot host this app's server routes.

## Permission model

| Identity                                      | Read                              | Write |
| --------------------------------------------- | --------------------------------- | ----- |
| Seeded owner with a verified Supabase session | Yes                               | Yes   |
| Valid private viewer token                    | Yes, via `read_shared_board` only | No    |
| Other signed-in user or anonymous visitor     | No                                | No    |

Both API routes and PostgreSQL enforce permissions. Every write route verifies the owner with `auth.getUser()` and uses that user's database JWT, so RLS still applies. Anonymous users have no table privileges. The viewer function verifies the **raw** token inside PostgreSQL, hashes it, and returns only the board and task fields needed to render the memo. It cannot modify records and never returns the owner ID or token hash. Possessing a database token hash does not grant access.

The viewer secret is delivered in a URL fragment (not in the request URL), removed from browser history on arrival, exchanged through a same-origin POST, and kept in an HttpOnly cookie for 30 days. Creating a replacement link changes the stored hash, immediately revoking the old link and all cookies using it. Anyone holding the active link can view the memo; only share it with the intended recipient. An optional PIN is not enabled in this version.

All mutation requests require the configured Origin and JSON content type. Private API responses are `no-store`. No task content is stored in localStorage, no service worker caches the board, and no external fonts, trackers, or assets receive requests from the app.

## Validation

```sh
pnpm test
pnpm build
```

The test suite runs the actual migration in an isolated PostgreSQL engine (PGlite), with Supabase-style `anon`, `authenticated`, and `auth.uid()` roles. It exercises owner writes, anonymous and unrelated-user denials, valid/invalid/revoked viewer links, hash non-disclosure, completion timestamps, atomic reordering, and CSRF/input validation. It does not replace testing your real Supabase Auth/email configuration after deployment.

The checked-in GitHub Actions workflow runs these checks for pushes and pull requests.
