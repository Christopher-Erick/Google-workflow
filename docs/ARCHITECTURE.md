# Architecture

## Overview

```
┌─────────────────┐     google.script.run      ┌──────────────────────┐
│  Web app (HTML) │ ─────────────────────────► │  Code.gs API (api*)  │
│  Index / JS /   │ ◄───────────────────────── │  Auth + Workflow     │
│  Styles         │                            └──────────┬───────────┘
└─────────────────┘                                       │
                                                          ▼
                          ┌───────────────┬───────────────┬──────────────┐
                          │ DriveService  │ SheetService  │ Notifications│
                          │ folders/files │ NAZ Workflow  │ Gmail urgent │
                          │ naming/notes  │ DB spreadsheet│ + reminders  │
                          └───────────────┴───────────────┴──────────────┘
```

- **Execute as:** deploying user (group Gmail)
- **Identity:** `Session.getActiveUser()` for the signed-in visitor
- **Authorisation:** email must appear in the Roles sheet (officer role or members list)

## Document type configuration

All chains, submitters, and editors live in `Config.gs` → `DOC_TYPES`.

Changing approval order or permissions should be done there first, then reflected in docs.

## Data store (Sheets)

Spreadsheet: `NAZ Workflow DB`

| Sheet | Purpose |
|-------|---------|
| `Roles` | role → email, optional WhatsApp |
| `Items` | one row per document instance |
| `Approvals` | immutable-ish event log per stage action |
| `Audit` | system/admin actions |
| `Settings` | key/value (reserved) |

### Item lifecycle

```
submit → pending (stage 0..n)
       → approved  (moved to Approved / type root folder)
       → declined  (moved to Declined + decline note file; process stops)
       → reopen    (back to pending; history retained)
edit/replace → reset all stages + notify roster
```

## Drive layout

```
Nazarene for she Document/
  Requisition/
    Pending/
    Approved/
    Declined/
  Minutes/
    Pending/
    Declined/
    (approved files live in Minutes/)
  Proof of Payment/
    Pending/
    Declined/
    (approved files live in Proof of Payment/)
```

File naming: `yyyy-MM-dd_<Type>_<Title>_vN.<ext>`

## Notifications

| Event | Recipients |
|-------|------------|
| Submit / reopen | All roster emails + urgent to current stage |
| Stage approved | All roster + urgent to next stage |
| Fully approved | All roster |
| Declined | All roster |
| Edit reset | All roster + urgent to current stage |
| 7-day idle | Current stage only (urgent/reminder) |

WhatsApp: phone fields stored; send path not wired in v1.

## Triggers

`dailyReminderJob` — time-driven, daily ~09:00 script timezone (`Africa/Nairobi`).

## Module responsibilities

| File | Responsibility |
|------|----------------|
| `Code.gs` | HTTP entry, `include()`, thin API wrappers |
| `Config.gs` | Product rules & constants |
| `Auth.gs` | Roles, permissions helpers |
| `SheetService.gs` | Persistence primitives |
| `DriveService.gs` | Folder/file operations |
| `Workflow.gs` | Domain operations |
| `Notifications.gs` | Email composition/send |
| `Setup.gs` | Bootstrap infra + roles |
| `Triggers.gs` | Scheduled jobs |

## Future extensions

- WhatsApp Business / Africa's Talking for urgent pings
- Google Picker for native Docs/Sheets without base64 upload
- Soft delete / archive views
- n8n bridge only if multi-system orchestration is required
