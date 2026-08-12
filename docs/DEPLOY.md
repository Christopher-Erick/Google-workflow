# Deploy guide

Production setup for the Nazarene SHE document workflow.

## Prerequisites

1. Organisation **group Gmail** (owns Drive)
2. Chrome (recommended)
3. ~15 minutes for first deploy
4. Role email list ready (do not commit those emails to git)

## What “group Gmail” means

Sign into that group inbox in Chrome before you create the script. The script will:

- create Drive folders under that account
- send emails from that account
- store the tracking spreadsheet under that account

Personal Gmail users (Chair, Patron, etc.) only open the web link and approve. You enter their emails in Setup — never share passwords in chat or git.

---

## 1. Create the Apps Script project

1. Go to [script.google.com](https://script.google.com) **while signed into the group Gmail**
2. **New project** → rename to `NAZ SHE Workflow`
3. Create script files and paste from this repository:

| Apps Script file | Repository file |
|------------------|-----------------|
| `Code.gs` | `Code.gs` |
| `Config.gs` | `Config.gs` |
| `SheetService.gs` | `SheetService.gs` |
| `DriveService.gs` | `DriveService.gs` |
| `Auth.gs` | `Auth.gs` |
| `Notifications.gs` | `Notifications.gs` |
| `Workflow.gs` | `Workflow.gs` |
| `Setup.gs` | `Setup.gs` |
| `Triggers.gs` | `Triggers.gs` |

4. Add HTML files (**File → HTML**). Names must match exactly (no `.html` in the Apps Script file name):

| Apps Script HTML | Repository file |
|------------------|-----------------|
| `Index` | `Index.html` |
| `Styles` | `Styles.html` |
| `JavaScript` | `JavaScript.html` |

5. Enable **Project Settings → Show "appsscript.json" manifest** and align with repository `appsscript.json` (timezone, webapp, oauthScopes).

---

## 2. Deploy the web app

1. **Deploy → New deployment → Web app**
2. Description: `SHE workflow v1`
3. **Execute as:** Me (group account)
4. **Who has access:** Anyone with a Google account  
   (Do **not** choose anonymous “Anyone”)
5. Deploy → authorise Drive / Gmail / Sheets / Triggers
6. Copy the **Web app URL**

---

## 3. First-time setup in the app

1. Open the Web app URL (group Gmail or Secretary)
2. Click **Create Drive folders & database**
3. Enter **separate** emails for Admin and Secretary (required — different people), plus other role emails (optional WhatsApp for a future release)
4. Paste the Web app URL into the setup field
5. **Save roles & finish setup**

### Expected Drive tree

```
Nazarene for she Document
  Requisition / Pending | Approved | Declined
  Minutes / Pending | Declined   (approved files → Minutes/)
  Proof of Payment / Pending | Declined
```

Spreadsheet `NAZ Workflow DB` is created in Drive (items, approvals, audit).

---

## 4. Share the link

Send the Web app URL to officers and members. Only emails listed in Setup can use the app.

---

## Optional: clasp

```bash
npm i -g @google/clasp
clasp login
cp .clasp.json.example .clasp.json
# set scriptId after clasp create / from Project Settings
clasp push
```

Then create the web app deployment from the Apps Script UI (clasp alone does not always finish OAuth consent UX).

---

## Acceptance test checklist

- [ ] Setup saves all role emails
- [ ] Secretary submits requisition → Chair receives urgent mail
- [ ] Chair submits requisition → status already past Chair
- [ ] Decline with note → Declined folder + note file
- [ ] Replace file → approvals reset + roster notified
- [ ] Member account can view but not approve/edit
- [ ] Admin force-approve / skip stage works
- [ ] Reopen declined item returns to pending
- [ ] After 7 days idle, reminder fires (or run `dailyReminderJob` in the editor)

## Behaviour reference

| Type | Submit | Chain | Edit (resets all) |
|------|--------|-------|-------------------|
| Requisition | Chair, Secretary | Chair → Patron → Treasurer | Secretary, Patron |
| Minutes | Secretary | Secretary → Asst. Secretary → Vice Chair | Secretary |
| Proof of Payment | Treasurer | Treasurer → Chair → Patron | Secretary |

See also [ARCHITECTURE.md](ARCHITECTURE.md) and [SECURITY.md](SECURITY.md).
