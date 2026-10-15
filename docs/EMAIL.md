# Email — dev mode & planned Gmail SMTP

MEDBOURSE will send transactional mail (invitations, later notifications) through **Gmail SMTP**. Until that send path is built, the API runs an **email dev mode**: it records the *intent* to send mail and never delivers anything.

## Current behaviour (dev mode)

- **Nothing is sent.** The API records intent through `recordOutboundMail(kind, to)` in [`apps/api/src/mail/devMail.ts`](../apps/api/src/mail/devMail.ts), which writes a single line to the API log:

  ```
  [medbourse-api] mail deferred (<kind>) to=<address> — dev mode: not sent
  ```

- The `SMTP_*` settings in [`apps/api/src/config.ts`](../apps/api/src/config.ts) are read but unused, so local development never needs real credentials and no request blocks on mail.
- Current call sites:
  - **Customer invitations** — `POST /customers/:id/invitations` (kind `customer-invitation`). The invitation token is returned **once** in the response for authorized staff to share; it is never emailed and never logged.
  - **In-app notifications** (P7-T02) are stored in the database and shown in the portal bell — they are **not** emailed.
- Delivery is not claimed anywhere. A logged intent is **not** a sent email, and the UI must not state that mail was sent while the dev mode is active.

## Safety rules (non-negotiable)

- Never log `SMTP_PASS`, invitation tokens, or message bodies that contain personal data.
- Do not claim delivery: no "email sent" copy in the UI or API responses while in dev mode.
- Secrets live only in `.env`; never in the client bundle, git, or logs.

## Configuration (Gmail SMTP — for the eventual send path)

Gmail **does not accept** the normal Google account password for SMTP. Use a Google **App Password**.

1. Enable **2-Step Verification** on the sending Google account.
2. Open [App passwords](https://myaccount.google.com/apppasswords).
3. Create an app password (label e.g. `MEDBOURSE`).
4. Put the **16-character app password** in `SMTP_PASS` (spaces optional).
5. Set `SMTP_USER` and `EMAIL_FROM` to that Gmail address.

Local `.env` (see [`.env.example`](../.env.example)):

```
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-account@gmail.com
SMTP_PASS=
EMAIL_FROM="MEDBOURSE <your-account@gmail.com>"
```

`SMTP_SECURE=false` is correct for port **587** (STARTTLS). Use port **465** only with `SMTP_SECURE=true`.

## Enabling real sending (follow-up)

Turning the dev mode into delivery is a separate task, not part of Phase 7. It must include:

- a mail transport dependency (e.g. `nodemailer`) wired behind `recordOutboundMail`;
- error and retry handling, plus a decision on whether send failures block the triggering request;
- rendering real message bodies (templates) for invitations and notification digests;
- an updated ADR if a non-Gmail provider is chosen.

Gmail enforces daily send quotas; high-volume production mail may need a dedicated provider, which would be a new ADR. Google Workspace accounts can use the same SMTP host with an app password or an admin-approved relay.
