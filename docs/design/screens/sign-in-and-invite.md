# Sign in and accept invite

Serves first: **hackathon judge** (credentials from Devpost's private field), then every invited
user. Routes: `/sign-in`, `/invite/:token`, `/reset/:token` (admin-issued one-time reset link;
ADR 0013). There is no public sign-up and no email-based reset.

## Purpose

Get an invited person into their workspace quickly and safely. Accounts exist by invite only; a
password reset is a one-time link an owner issues. The screen also tells a first-time visitor what
4x35 is, in one line, before they type anything.

## Layout

A single centred column (max 400px) on `--color-bg`: product name "4x35", the one-line statement,
then a `--color-surface` panel with the form. Below the panel, in muted text: "Accounts are by invite
only." and the data notice "Uploads are deleted after 30 days." No illustration, no hero image.

Forms:
- **Sign in**: Email, Password (with a show/hide toggle), primary "Sign in". Under the button: "Forgot
  your password? Ask a workspace owner for a reset link."
- **Accept invite** (`/invite/:token`): a summary line "{{inviter}} invited you to {{workspace}} as
  {{role}}." Email is shown read-only from the invite. Fields: Your name, Password, Confirm password,
  with the password rule shown before typing. Primary "Create account and sign in".
- **Reset** (`/reset/:token`): New password, Confirm password, primary "Set password".

### 375

Column fills the width with 16px gutters. Inputs and buttons are full width, 48px high (≥ 44px
target), text at `--text-base` (16px, avoids iOS zoom). The statement sits above the panel and wraps.
The show-password toggle is a 44 x 44 button inside the input's right edge.

### 768

Same column, centred, 400px wide, top offset 15vh.

### 1440

Same column, centred, 400px wide, top offset 20vh. The statement may sit on one line. Nothing else
appears on the page: the judge's eye goes to the form.

## Components

Input (default, invalid, disabled), Button (primary, loading), password visibility toggle (ghost
icon Button with text alternative), inline ErrorState banner inside the panel (problem+json),
Toast (success after password set).

## States

### Empty

The default form: empty fields, no errors, the primary button enabled (validation runs on submit and
on blur after the first submit). An invite link without a token or with a malformed token shows
"This invite link is incomplete. Open the full link from your invite, or ask the workspace owner for
a new one." with no form.

### Loading

On submit the primary button enters its loading state ("Signing in", "Creating account"), fields are
read-only, and the panel has `aria-busy="true"`. Opening an invite link first validates the token:
the panel shows two Skeleton lines with the caption "Checking your invite".

### Error

- Wrong email or password (401): one message above the form, never saying which was wrong: "That
  email and password do not match an account." Focus moves to the message; the password field is
  cleared.
- Rate limited (429): "Too many attempts. Try again in {{seconds}} seconds." The button stays
  disabled with a live countdown, announced once.
- Invite expired or used (410 or 409): "This invite has expired or was already used. Ask {{inviter}}
  for a new one." No form.
- Field validation: invalid email, password shorter than the rule, confirmation mismatch: each
  field shows the invalid Input state with its message; a summary above the form lists the errors as
  links to the fields.
- Any other problem+json: inline ErrorState with title, detail, trace id and "Try again".

### Partial

The invite is valid but the account already exists for that email (the person was invited to a
second workspace): the form shows only Password and the line "You already have an account. Sign in
to join {{workspace}}." After sign-in the person lands in the new workspace.

### Success

Sign in: redirect to the URL the person came from, or to the batches home. Accept invite and reset:
a success Toast "Password set. You are signed in." and redirect to the batches home of that
workspace, with focus on its `h1`.

## Interactions

- `Enter` in any field submits. The button is never disabled just because fields are empty; errors
  explain instead.
- Show/hide password toggles `type` and its own label ("Show password" / "Hide password"); it does
  not move focus.
- Email is trimmed and compared case-insensitively; the field uses `type="email"`,
  `autocomplete="username"`; password `autocomplete="current-password"` (sign in) or
  `"new-password"` (invite, reset). Paste is always allowed (WCAG 3.3.8, accessible
  authentication: no cognitive test, password managers work).
- After a session ends elsewhere, the sign-in page shows the reason "Your session ended. Sign in
  again." above the form.

## Keyboard map

| Key | Action | Scope |
|---|---|---|
| `Tab` / `Shift+Tab` | Move between fields, toggle, button, links | Form |
| `Enter` | Submit the form | Any field |
| `Space` | Toggle password visibility | Toggle button |

There are no single-key shortcuts on these routes, so typing is never intercepted.

## Copy

| Key | en |
|---|---|
| `signIn.page.title` | Sign in to 4x35 |
| `signIn.page.statement` | Turn free-text payment addresses into ISO 20022 structured addresses, with a reason for every field. |
| `signIn.page.inviteOnly` | Accounts are by invite only. |
| `signIn.page.retention` | Uploads are deleted after 30 days. |
| `signIn.form.email` | Email |
| `signIn.form.password` | Password |
| `signIn.form.showPassword` | Show password |
| `signIn.form.hidePassword` | Hide password |
| `signIn.form.submit` | Sign in |
| `signIn.form.submitting` | Signing in |
| `signIn.form.forgot` | Forgot your password? Ask a workspace owner for a reset link. |
| `signIn.form.errorSummary` | Check these fields: |
| `signIn.error.mismatch` | That email and password do not match an account. |
| `signIn.error.rateLimited` | Too many attempts. Try again in {{seconds}} seconds. |
| `signIn.error.emailInvalid` | Enter an email address like name@example.com. |
| `signIn.error.emailRequired` | Enter your email. |
| `signIn.error.passwordRequired` | Enter your password. |
| `signIn.error.sessionEnded` | Your session ended. Sign in again. |
| `signIn.invite.title` | Join {{workspace}} |
| `signIn.invite.summary` | {{inviter}} invited you to {{workspace}} as {{role}}. |
| `signIn.invite.checking` | Checking your invite |
| `signIn.invite.name` | Your name |
| `signIn.invite.password` | Password |
| `signIn.invite.confirmPassword` | Confirm password |
| `signIn.invite.passwordRule` | At least {{min}} characters. A passphrase of several words works well. |
| `signIn.invite.submit` | Create account and sign in |
| `signIn.invite.submitting` | Creating account |
| `signIn.invite.existingAccount` | You already have an account. Sign in to join {{workspace}}. |
| `signIn.invite.expired` | This invite has expired or was already used. Ask {{inviter}} for a new one. |
| `signIn.invite.incomplete` | This invite link is incomplete. Open the full link from your invite, or ask the workspace owner for a new one. |
| `signIn.invite.roleOwner` | owner |
| `signIn.invite.roleReviewer` | reviewer |
| `signIn.reset.title` | Set a new password |
| `signIn.reset.newPassword` | New password |
| `signIn.reset.confirmPassword` | Confirm password |
| `signIn.reset.submit` | Set password |
| `signIn.reset.expired` | This reset link has expired or was already used. Ask a workspace owner for a new one. |
| `signIn.error.passwordShort` | Use at least {{min}} characters. |
| `signIn.error.passwordMismatch` | The passwords do not match. |
| `signIn.error.nameRequired` | Enter your name. |
| `signIn.success.passwordSet` | Password set. You are signed in. |

## Accessibility

- One `h1` per route ("Sign in to 4x35", "Join {{workspace}}", "Set a new password").
- Labels are visible `label` elements, never placeholders. Errors are linked by
  `aria-describedby`; invalid fields have `aria-invalid="true"`.
- On a failed submit, focus moves to the error summary (`role="alert"`, `tabindex="-1"`); each item
  links to its field.
- No time limit on the form; the rate-limit countdown is announced once, not every second.
- Accessible authentication (WCAG 3.3.8): paste and password managers work; no CAPTCHA, no puzzle.
- Contrast: labels `--color-text`, hints `--color-text-muted` (both ≥ 4.5:1 on `--color-surface`);
  invalid border `--status-fail-border` (≥ 3:1) plus the octagon icon and text.
- Works at 320px and 400% zoom with no horizontal scroll.
