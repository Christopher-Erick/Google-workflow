# Nazarene for SHE — Document Workflow

Google Apps Script web app for sequential approvals (Requisition, Minutes, Proof of Payment), Drive filing, email alerts, and 7-day reminders.

## What you need

1. The **group Gmail** (the one that already has Drive)
2. A browser (Chrome)
3. About 15 minutes for first deploy

## What “group Gmail” means here

Sign into **that group inbox** in Chrome before you create the script.  
The script will:

- create the Drive folders under that account  
- send emails from that account  
- store the tracking spreadsheet under that account  

Personal Gmail users (Chair, Patron, etc.) only open the web link and approve — you enter their emails in Setup (never share passwords).

## Deploy steps

### 1. Create the Apps Script project

1. Go to [script.google.com](https://script.google.com) **while signed into the group Gmail**
2. **New project** → rename to `NAZ SHE Workflow`
3. Create these script files (File → Script) and paste contents from this folder:

| Apps Script file | Local file |
|------------------|------------|
| `Code.gs` | `Code.gs` |
| `Config.gs` | `Config.gs` |
| `SheetService.gs` | `SheetService.gs` |
| `DriveService.gs` | `DriveService.gs` |
| `Auth.gs` | `Auth.gs` |
| `Notifications.gs` | `Notifications.gs` |
| `Workflow.gs` | `Workflow.gs` |
| `Setup.gs` | `Setup.gs` |
| `Triggers.gs` | `Triggers.gs` |

4. Add HTML files (File → HTML):

| Apps Script HTML | Local file |
|------------------|------------|
| `Index` | `Index.html` |
| `Styles` | `Styles.html` |
| `JavaScript` | `JavaScript.html` |

5. Project Settings → copy `appsscript.json` scopes if asked, or use **Project Settings → Show appsscript.json** and paste from this repo.

### 2. Deploy the web app

1. **Deploy → New deployment → Web app**
2. Description: `SHE workflow v1`
3. **Execute as:** Me (group account)
4. **Who has access:** Anyone with a Google account
5. Deploy → authorize all Drive / Gmail / Sheets permissions
6. Copy the **Web app URL**

### 3. First-time setup in the app

1. Open the Web app URL (still as group Gmail or as Secretary)
2. Click **Create Drive folders & database**
3. Fill in emails (and optional WhatsApp numbers for later)
4. Paste the Web app URL into the setup field
5. **Save roles & finish setup**

Drive will contain:

```
Nazarene for she Document
  Requisition / Pending | Approved | Declined
  Minutes / Pending | Declined   (approved files → Minutes root)
  Proof of Payment / Pending | Declined
```

A spreadsheet `NAZ Workflow DB` is also created in Drive (tracking + audit).

### 4. Share the link

Send the Web app URL to officers and members. Only emails listed in Setup can use it.

## Behaviour summary

| Type | Submit | Chain | Edit (resets all) |
|------|--------|-------|-------------------|
| Requisition | Chair, Secretary | Chair → Patron → Treasurer | Secretary, Patron |
| Minutes | Secretary | Secretary → Asst. Secretary → Vice Chair | Secretary |
| Proof of Payment | Treasurer | Treasurer → Chair → Patron | Secretary |

- Chair / Secretary / Treasurer first-stage auto-approve when that person submits
- Decline requires a note → file + note in Declined → process stops → reopen allowed
- Everyone on the roster gets status emails; current approver gets **urgent** mail
- Daily job reminds if idle **7+ days**
- Admin (Secretary / Admin email): force-approve, skip stage, manage Setup
- WhatsApp: numbers stored now; sending comes in v2 (API needed)
- SMS: not free at scale — not included

## Optional: clasp push

If you use [clasp](https://github.com/google/clasp):

```bash
npm i -g @google/clasp
clasp login
clasp create --title "NAZ SHE Workflow" --type webapp
clasp push
```

Then deploy from the Apps Script UI as above.

## Test checklist

- [ ] Setup saves all role emails  
- [ ] Secretary submits requisition → Chair gets urgent mail  
- [ ] Chair submits requisition → status already past Chair  
- [ ] Decline with note → Declined folder + note file  
- [ ] Replace file → approvals reset + notify  
- [ ] Member account can view but not approve/edit  
- [ ] After 7 days idle, reminder fires (or run `dailyReminderJob` in editor)
