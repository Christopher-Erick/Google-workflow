# Nazarene for SHE — Google Document Workflow

Sequential document approval system for the Church of the Nazarene **SHE** organisation.

Built on **Google Apps Script**, **Drive**, **Sheets**, and **Gmail**. Officers submit and approve documents in order; members can view status and files; the secretary retains overlay admin control.

---

## Features

| Capability | Detail |
|------------|--------|
| Three document tracks | Requisition, Minutes, Proof of Payment |
| Sequential approvals | Role-based stages; decline stops the process with a required note |
| Drive filing | Named files, Pending / Approved / Declined folders |
| Notifications | Roster email on status changes; urgent mail to the current approver |
| Reminders | Daily check; notify if idle ≥ 7 days |
| Admin controls | Force-approve, skip stage, manage roles |
| Edit safety | Allowed editors only; any replace **resets all approvals** and notifies everyone |
| Access control | Only emails listed in Setup can use the app |

WhatsApp numbers can be stored in Setup; WhatsApp delivery is planned for a later release (API required). SMS is not included (not free at scale).

---

## Approval chains

| Type | Who may submit | Chain | Who may edit (resets flow) |
|------|----------------|-------|----------------------------|
| **Requisition** | Chair, Secretary | Chair → Patron → Treasurer | Secretary, Patron |
| **Minutes** | Secretary | Secretary → Assistant Secretary → Vice Chair | Secretary |
| **Proof of Payment** | Treasurer | Treasurer → Chair → Patron | Secretary |

If the submitter holds the first-stage role, that stage is **auto-approved** on submit (e.g. Chair submits a requisition → waiting on Patron).

---

## Repository layout

```
├── README.md                 # You are here
├── CHANGELOG.md
├── LICENSE
├── CONTRIBUTING.md
├── SETUP.md                  # Quick pointer → full deploy guide
├── appsscript.json           # Apps Script manifest & OAuth scopes
├── .clasp.json.example       # Optional clasp binding
├── .editorconfig
├── .gitignore
│
├── Code.gs                   # Web entry (doGet) + client API
├── Config.gs                 # Constants, roles, doc-type definitions
├── Auth.gs                   # Identity & permissions
├── SheetService.gs           # Spreadsheet database
├── DriveService.gs           # Folders, naming, decline notes
├── Workflow.gs               # Submit / approve / decline / reopen / admin
├── Notifications.gs          # Email (+ reminder helpers)
├── Setup.gs                  # First-run roles & infrastructure
├── Triggers.gs               # dailyReminderJob
│
├── Index.html                # Web app shell
├── Styles.html
├── JavaScript.html
│
└── docs/
    ├── ARCHITECTURE.md       # Design & data model
    ├── DEPLOY.md             # Production deploy & setup
    └── SECURITY.md           # Threat model & hardening
```

---

## Quick start

1. Sign into the organisation **group Gmail** (owns Drive).
2. Follow **[docs/DEPLOY.md](docs/DEPLOY.md)** to create the Apps Script project, paste sources, and deploy the web app.
3. Open the web app → create Drive folders & database → enter role emails → save.
4. Share the web app URL with officers and members on the roster.

Optional: use [clasp](https://github.com/google/clasp) with `.clasp.json.example` for push/pull instead of manual paste.

---

## Requirements

- Google account for the **group inbox** (script owner)
- Personal Gmail accounts for officers/members
- Chrome (or any modern browser)
- Deploy access: **Anyone with a Google account** (execute as the group account)

---

## Status

**v1.0.0** — core approval flows, Drive filing, email notifications, admin tools, 7-day reminders.

See [CHANGELOG.md](CHANGELOG.md).

---

## License

See [LICENSE](LICENSE). Intended for Church of the Nazarene SHE organisational use.
