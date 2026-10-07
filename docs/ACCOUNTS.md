# Accounts, role access and password recovery

Open **Open control center** on the landing page and choose Admin, Transport, Faculty, Student or Parent. Every role has sign-in, registration and **Forgot password**. The server checks the stored account role; selecting a different role cannot grant different permissions.

| Role      | Entry/dashboard | Controls                                                                                                                           |
| --------- | --------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Admin     | `/admin`        | Campus overview, accounts and password recovery, password recovery, student links, buses, timetables, attendance and reports       |
| Transport | `/transport`    | Fleet, buses, drivers, routes, stops, allocations, journeys, bus attendance and verification                                       |
| Faculty   | `/faculty`      | Assigned classes, academic attendance and verification, boarding information and reports; no account administration or bus editing |
| Student   | `/student`      | Own linked profile, timetable, journey, bus/class attendance and notifications                                                     |
| Parent    | `/parent`       | Linked children, their timetable, journeys, bus/class attendance and notifications                                                 |

Existing `/app` links redirect to the account's role dashboard. Back, Home and Sign out remain available. Existing campus design, animation and scroll effects are retained.

## Automatic registration for all roles

Every successful registration activates immediately and opens that role's dashboard. There are no invitation codes, approval queues or manual account approvals.

- **Admin, Faculty, Transport:** register with name, a unique email and a password of at least 10 characters. The chosen role determines the available controls.
- **Student:** register with academic, RFID and bus details. Existing student records still require matching identity/class details; new valid registrations become active immediately.
- **Parent:** register with the student's registration number and the parent mobile already stored on that student's record. Both must match. A matching parent is linked to that student and can immediately view the child's dashboard data. The parent's name is only their own display name.

An email identifies one account and one role. Selecting a different role at login does not change an existing account. In particular, an email registered for Transport must sign in as Transport; a new Admin account needs another email.

The first Admin can still use initial workspace setup. Previously pending staff registrations are automatically activated at deployment using their submitted password and requested role. Duplicate requests for an already registered email are closed without changing the existing account's role or password. Declined requests stay declined; people can register again through the automatic flow.

**Deployment access policy:** Admin self-registration is public and immediately grants full campus controls. This is the user-requested automatic activation policy; it does not verify that a visitor is campus staff.

## Administrator-assisted recovery (current production mode)

There is no production reset email service configured. The UI explains that recovery requires assistance from the campus administrator.

1. On any role's sign-in or registration form, select **Forgot password** and submit the registered email with the correct role.
2. The response is generic to avoid revealing whether an account exists. A matching account creates or refreshes a recovery request; no password changes at this point.
3. An Admin opens **Accounts & access → Password recovery**. The queue refreshes every 15 seconds and has a manual refresh button.
4. Verify the account holder's identity through the campus's established process. Check **I verified this person's identity**, then select **Issue reset link**.
5. Copy the masked link and share it privately with that person. It expires after **20 minutes**, works once, and is bound to the account. Issuing another link invalidates the previous link. A repeated public recovery request cannot invalidate an Admin-issued link.
6. The person opens the link, enters and confirms their new password, then signs in through the correct role. Existing HTTP and Socket.IO sessions are revoked and old push subscriptions are removed.

The token is in the URL fragment, rather than its query string, and is stored as a SHA-256 hash. Passwords remain bcrypt hashes; reset tokens are excluded from audit records and ordinary lists.

**Admin recovery:** any signed-in Admin can verify and assist a locked-out Admin. Registering a new account does not change an existing account's password or role. A new Admin registration must use a separate email.

## Configuration

Set `AUTH_APP_URL` to the deployed frontend origin (production defaults to `https://frontend-neon-gamma-12.vercel.app`). For local development use `http://localhost:5173`.

Future optional email recovery requires both `RESEND_API_KEY` and `AUTH_EMAIL_FROM` (a verified sender) on the backend. Without both, the application stays in administrator-assisted mode. Email failures leave the request available for administrator assistance. Keep service keys outside source control and chat.

## Verification

Run `pnpm build`, `pnpm test`, and, with database environment variables available, `node backend/scripts/verify-accounts.mjs` from the repository root. The integration script uses a disposable schema and deletes it after the test; production application records are not modified. It checks automatic registration for all three staff roles and pending-request migration, all five roles, linked child data, generic recovery responses, identity confirmation, one-time/expired reset links, session revocation and request limits.
