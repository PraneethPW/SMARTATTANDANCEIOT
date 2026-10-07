# Accounts, role access and password recovery

Open **Open control center** on the landing page and choose Admin, Transport, Faculty, Student or Parent. Every role has sign-in, registration and **Forgot password**. The server checks the stored account role; selecting a different role cannot grant different permissions.

| Role      | Entry/dashboard | Controls                                                                                                                           |
| --------- | --------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Admin     | `/admin`        | Campus overview, accounts and staff approvals, password recovery, student links, buses, timetables, attendance and reports         |
| Transport | `/transport`    | Fleet, buses, drivers, routes, stops, allocations, journeys, bus attendance and verification                                       |
| Faculty   | `/faculty`      | Assigned classes, academic attendance and verification, boarding information and reports; no account administration or bus editing |
| Student   | `/student`      | Own linked profile, timetable, journey, bus/class attendance and notifications                                                     |
| Parent    | `/parent`       | Linked children, their timetable, journeys, bus/class attendance and notifications                                                 |

Existing `/app` links redirect to the account's role dashboard. Back, Home and Sign out remain available. Existing campus design, animation and scroll effects are retained.

## Registering Admin, Faculty and Transport without a code

1. Choose **Admin**, **Faculty** or **Transport**, then **Register**. Enter name, email and a password of at least 10 characters. No registration portal asks for an invitation code.
2. Submit the registration. The application confirms it is awaiting campus approval; no active staff account or session is created yet.
3. An existing Admin opens **Accounts & access → Staff registrations**. The queue shows each applicant's name, email and requested role and updates when requests arrive.
4. Verify the applicant's identity and authorization for the displayed role. Check **I verified this applicant for [role] access**, then choose **Approve [role]**. Only an Admin can approve or decline requests.
5. The approved person signs in with the registration email and password and receives their role's dashboard. Declined applicants receive no account access and may reapply. Duplicate requests and already handled approvals are rejected.

The first Admin still uses initial workspace setup. Existing accounts continue signing in normally. Existing pending Admin requests are preserved as Admin requests. Approved or declined requests have their temporary password hash removed. Invitation creation and code-based signup have been retired; recipients of old codes should register through the new approval flow.

Student registration activates immediately using the existing academic/RFID/bus checks. Parent registration continues matching only the student's registration number and recorded parent mobile number. Administrators can also create accounts and link children using the existing campus tools.

## Administrator-assisted recovery (current production mode)

There is no production reset email service configured. The UI explains that recovery requires assistance from the campus administrator.

1. On any role's sign-in or registration form, select **Forgot password** and submit the registered email with the correct role.
2. The response is generic to avoid revealing whether an account exists. A matching account creates or refreshes a recovery request; no password changes at this point.
3. An Admin opens **Accounts & access → Password recovery**. The queue refreshes every 15 seconds and has a manual refresh button.
4. Verify the account holder's identity through the campus's established process. Check **I verified this person's identity**, then select **Issue reset link**.
5. Copy the masked link and share it privately with that person. It expires after **20 minutes**, works once, and is bound to the account. Issuing another link invalidates the previous link. A repeated public recovery request cannot invalidate an Admin-issued link.
6. The person opens the link, enters and confirms their new password, then signs in through the correct role. Existing HTTP and Socket.IO sessions are revoked and old push subscriptions are removed.

The token is in the URL fragment, rather than its query string, and is stored as a SHA-256 hash. Passwords remain bcrypt hashes; reset tokens are excluded from audit records and ordinary lists.

**Admin recovery:** another Admin must verify and assist a locked-out Admin. Maintain at least two trusted Admin accounts for this workflow. If all Admins lose access, this mode requires assistance from the deployment/database owner; it cannot generate its own approval.

## Configuration

Set `AUTH_APP_URL` to the deployed frontend origin (production defaults to `https://frontend-neon-gamma-12.vercel.app`). For local development use `http://localhost:5173`.

Future optional email recovery requires both `RESEND_API_KEY` and `AUTH_EMAIL_FROM` (a verified sender) on the backend. Without both, the application stays in administrator-assisted mode. Email failures leave the request available for administrator assistance. Keep service keys outside source control and chat.

## Verification

Run `pnpm build`, `pnpm test`, and, with database environment variables available, `node backend/scripts/verify-accounts.mjs` from the repository root. The integration script uses a disposable schema and deletes it after the test; production application records are not modified. It checks code-free registration and approval for all three staff roles, all five roles, linked child data, generic recovery responses, identity confirmation, one-time/expired reset links, session revocation and request limits.
