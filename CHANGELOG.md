# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

- **Admin and Secretary are separate roles:** Admin alone has overlay powers (setup, force-approve, skip). Secretary no longer inherits Admin. Setup rejects identical Admin/Secretary emails.

## [1.0.0] — 2026-08-12

### Added

- Google Apps Script web application for SHE document approvals
- Document types: Requisition, Minutes, Proof of Payment
- Sequential stage approvals with required decline notes
- Drive folder tree and `yyyy-MM-dd_Type_Title_vN` file naming
- Spreadsheet-backed items, approvals, roles, settings, and audit log
- Roster email notifications and urgent mail to the current approver
- Daily reminder job for items idle ≥ 7 days
- Admin force-approve and skip-stage
- Edit/replace with full approval reset and roster notify
- Reopen declined items (submitter or admin)
- Setup UI for role emails and optional WhatsApp numbers (delivery later)
- Deploy, architecture, and security documentation
