# Security

## Trust model

| Actor | Trust |
|-------|--------|
| Group Gmail (script owner) | Full Drive/Sheets/Gmail power for the workflow |
| **Admin** (separate email from Secretary) | Overlay admin in-app: force-approve, skip stage, manage Setup/roles |
| **Secretary** | Submit/edit per document rules; minutes first stage — **not** Admin |
| Stage officers | Approve/decline only on their stage; limited edit rights by type |
| Members | View status and open Drive links only |
| Anyone not on roster | Rejected after setup (`requireKnownUser_`) |

## Deploy settings (required)

- **Execute as:** Me (group account)
- **Who has access:** Anyone with a **Google account** (not “Anyone” anonymous)

Anonymous access would break identity checks and must not be used.

## Secrets & PII

- Never commit production emails, phone numbers, web app URLs with tokens, or `.clasp.json` script IDs tied to private projects if you treat them as sensitive.
- Role emails live in the spreadsheet created at setup — that file inherits Drive sharing of the group account; restrict Drive sharing carefully.
- Decline notes and document contents may include financial or pastoral-sensitive data; treat Drive ACLs as the boundary.

## OAuth scopes

Declared in `appsscript.json`:

- Drive (create/move files and folders)
- Spreadsheets (workflow DB)
- Gmail send / MailApp
- User email
- ScriptApp (triggers)

Prefer least privilege when adding features; do not request `drive.readonly`-incompatible broad scopes without need. Current Drive scope is full because the app creates and reorganises files.

## Application controls

- Roster gate after setup
- Stage-gated approve/decline
- Edit limited to configured roles; edit resets approvals
- Admin actions audited in `Approvals` / `Audit` sheets
- Decline requires a non-empty note and attaches a note file beside the document

## Residual risks

1. **Link + Google login:** Anyone who knows the URL and is added (or guessed) onto the members list can view metadata and open files they can access in Drive.
2. **Group inbox password sharing:** Anyone with group Gmail credentials can redeploy or read the DB; rotate access and prefer limited delegates where possible.
3. **Drive link sharing:** File URLs work for users who can open the file; keep folder permissions aligned with the group account’s sharing policy.
4. **Email spoofing is N/A for identity:** Authorisation uses Google sign-in email, not mail headers.

## Reporting

Report security issues privately to the SHE secretary / project maintainer; do not open public issues with exploit detail for live deployments.
