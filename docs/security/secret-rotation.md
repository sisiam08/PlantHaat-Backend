# Secret rotation runbook

> Never print secret values in chat, logs, docs, commits or screenshots. This file records only
> pattern types, file names and commit hashes. The bKash receiving number is the owner's real
> personal number: keep it, never rotate or print it, and mask it in reports.

## What was found (2026-11-19)

| Pattern type | Where | State |
|---|---|---|
| Cloudinary cloud name + API key + API secret | `backend/.env.example` | Removed from the working tree; still present in history at commit `35675ba` |
| JWT access secret assignment | `backend/.env.example`, `backend/.env.test.example` | Placeholder-like values only; no real secret found |
| Database URL with password | `backend/.env.example`, `backend/.env.test.example` | Placeholder-like values only; no real secret found |
| Data encryption key assignment | `backend/.env.example`, `backend/.env.test.example` | Placeholder-like values only; no real secret found |
| Admin password assignment | `backend/.env.example`, `backend/.env.test.example`; frontend e2e fixtures | Placeholder/test values only; no production secret found |
| Cloudinary `cloudinary://` URL | none in tracked files | none |
| SMTP / S3 keys | none in tracked files | none |

Local `backend/.env` and `frontend/.env.local` are gitignored. They contain the real runtime values;
they were not committed. `backend/scripts/check-secrets.mjs` now blocks new credential-like values
in tracked files and runs as part of `npm run lint`.

## Rotation order

1. **Cloudinary** (highest priority because it appears in history).
2. **SMTP** (if configured).
3. **S3** (if configured).
4. **Database password**.
5. **JWT access secret**.
6. **Admin password** (if it was ever shared outside the owner's password manager).
7. **`DATA_ENCRYPTION_KEY`** last; it changes stored data and needs a re-encryption plan.

## Cloudinary

1. Create a new API key/secret pair in the Cloudinary console (keep the same cloud name unless it
   was also exposed; the cloud name is public, the secret is not).
2. Update `CLOUDINARY_API_KEY` and `CLOUDINARY_API_SECRET` in every deployment environment
   (dev/test/prod) and in the owner's local `backend/.env`.
3. Restart the API and run `npm run uploads:smoke` (uses its own temporary folder and deletes it).
4. Upload one product image through the seller UI and confirm the returned URL is Cloudinary.
5. Revoke/delete the old API key in Cloudinary.
6. If the old key was used by any external integration, update that integration first.

## SMTP

1. Create a new app password / SMTP credential with the provider.
2. Update `SMTP_PASS` (and `SMTP_USER` if it changed) in every environment.
3. Restart the API and trigger a password-reset or verification email; confirm delivery.
4. Revoke the old credential.

## S3 / S3-compatible storage

1. Create a new access key pair with the same bucket policy.
2. Update `S3_ACCESS_KEY_ID` and `S3_SECRET_ACCESS_KEY`.
3. Restart the API; open an admin seller document and a public S3-backed image.
4. Revoke the old key. Private documents are served through short-lived presigned URLs, so no
   database change is needed.

## Database

1. Rotate the database user password in the provider console.
2. Update `DATABASE_URL` in every environment; do not print the new value.
3. Restart the API and run `GET /api/v1/health` plus `npm run db:status:all`.
4. Old connection pools die on restart; no data rewrite is needed.

## JWT access secret

`JWT_ACCESS_SECRET` signs short-lived access tokens. Rotating it invalidates current access tokens
(clients refresh normally); refresh sessions are stored hashed in the database and are not signed by
this secret. To force every user to log in again, additionally revoke refresh sessions.

1. Generate a new 32+ character secret.
2. Update `JWT_ACCESS_SECRET` in every environment and restart the API.
3. Verify login, refresh and logout. Optionally revoke all sessions for a hard reset.

## Admin password

1. Change it through the authenticated change-password flow (or the admin seed for a fresh install).
2. Confirm the old password no longer works and active sessions are revoked if required.

## `DATA_ENCRYPTION_KEY` (do last)

`DATA_ENCRYPTION_KEY` encrypts seller payout account numbers into `SellerPayoutAccount.accountNumberEnc`.
Changing the key without re-encrypting existing rows makes those rows unreadable.

1. Keep the old key available for decryption; generate a new key.
2. Add/execute a one-off re-encryption procedure that decrypts with the old key and re-encrypts with
   the new key inside a transaction per row.
3. Verify every seller payout account can still be read/masked and that a payout can be requested.
4. Remove the old key only after a verified backup and a successful read test.
5. No such re-encryption script exists in this repository yet; do not rotate this key until that
   procedure is written and tested on the isolated test stack.
