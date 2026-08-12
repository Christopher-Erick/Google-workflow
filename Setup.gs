/**
 * One-time / admin setup: roles, members, branding, Drive tree, reminder trigger
 */

function runInitialSetup() {
  ensureDb_();
  ensureDriveTree_();
  ensureReminderTrigger_();
  return {
    ok: true,
    message: 'Database, Drive folders, and reminder trigger are ready. Save roles & members next.'
  };
}

function saveRoles_(payload) {
  var ctx = getUserContext_();
  // First-time setup: allow whoever is deploying (group account). After that, Admin only.
  var setupDone = getScriptProps_().getProperty(PROP.SETUP_DONE) === '1';
  if (setupDone && !ctx.isAdmin) {
    throw new Error('Only the Admin can update roles after setup. Secretary cannot change Setup.');
  }

  ensureDb_();
  ensureDriveTree_();

  var sheet = getDb_().getSheetByName(SHEETS.ROLES);
  var last = sheet.getLastRow();
  if (last > 1) {
    sheet.deleteRows(2, last - 1);
  }

  var now = nowIso_();
  var rolesPayload = payload.roles || {};

  var adminEmail = String((rolesPayload.admin && rolesPayload.admin.email) || '').trim().toLowerCase();
  var secretaryEmail = String((rolesPayload.secretary && rolesPayload.secretary.email) || '').trim().toLowerCase();
  if (!adminEmail) {
    throw new Error('Admin email is required. Admin and Secretary are separate roles — do not leave Admin blank.');
  }
  if (!secretaryEmail) {
    throw new Error('Secretary email is required.');
  }
  if (adminEmail === secretaryEmail) {
    throw new Error('Admin and Secretary must be different people (different email addresses).');
  }

  OFFICER_ROLES.forEach(function (role) {
    var entry = rolesPayload[role] || {};
    var email = String(entry.email || '').trim();
    var whatsapp = String(entry.whatsapp || '').trim();
    if (email && email.indexOf('@') < 0) {
      throw new Error('Invalid email for ' + role);
    }
    sheet.appendRow([role, email, whatsapp, now]);
  });

  saveMembersList_(payload.members || []);
  ensureAccessEmailsOnRoster_(ctx.email);

  if (payload.webAppUrl) {
    getScriptProps_().setProperty(PROP.WEB_APP_URL, String(payload.webAppUrl).trim());
  }
  if (payload.orgSlogan != null) {
    getScriptProps_().setProperty(PROP.ORG_SLOGAN, String(payload.orgSlogan).trim());
  }
  if (payload.whatsappMode) {
    getScriptProps_().setProperty(PROP.WHATSAPP_MODE, String(payload.whatsappMode).trim());
  }
  if (payload.whatsappWebhookUrl != null) {
    getScriptProps_().setProperty(PROP.WHATSAPP_WEBHOOK_URL, String(payload.whatsappWebhookUrl).trim());
  }

  if (payload.logoBase64 && payload.logoFileName) {
    saveLogoUpload_(payload.logoBase64, payload.logoFileName, payload.logoMimeType);
  }

  getScriptProps_().setProperty(PROP.SETUP_DONE, '1');
  ensureReminderTrigger_();
  audit_('', 'roles_saved', ctx.email, {});

  return { ok: true, setupDone: true, context: getUserContext_(), branding: getBranding_() };
}

function saveMembersList_(members) {
  var sheet = getDb_().getSheetByName(SHEETS.MEMBERS);
  var last = sheet.getLastRow();
  if (last > 1) sheet.deleteRows(2, last - 1);
  var now = nowIso_();
  (members || []).forEach(function (m) {
    var email = String(m.email || '').trim().toLowerCase();
    var whatsapp = String(m.whatsapp || '').trim();
    var name = String(m.name || '').trim();
    if (!email && !whatsapp) return;
    if (email && email.indexOf('@') < 0) {
      throw new Error('Invalid member email: ' + email);
    }
    sheet.appendRow([name, email, whatsapp, now]);
  });
}

function ensureAccessEmailsOnRoster_(actorEmail) {
  var roleMap = getRoleMap_();
  var officerEmails = {};
  OFFICER_ROLES.forEach(function (role) {
    if (roleMap[role] && roleMap[role].email) officerEmails[roleMap[role].email] = true;
  });
  var sheet = getDb_().getSheetByName(SHEETS.MEMBERS);
  var existing = listMembers_();
  var have = {};
  existing.forEach(function (m) { if (m.email) have[m.email] = true; });

  var extras = [];
  var effective = String(Session.getEffectiveUser().getEmail() || '').trim().toLowerCase();
  [actorEmail, effective].forEach(function (email) {
    email = String(email || '').trim().toLowerCase();
    if (!email || officerEmails[email] || have[email]) return;
    extras.push(email);
    have[email] = true;
  });
  var now = nowIso_();
  extras.forEach(function (email) {
    sheet.appendRow(['Workflow access', email, '', now]);
  });
}

function saveLogoUpload_(base64, fileName, mimeType) {
  var bytes = Utilities.base64Decode(base64);
  var blob = Utilities.newBlob(bytes, mimeType || 'image/png', fileName || 'logo.png');
  var root = ensureDriveTree_();
  var brandFolder = findOrCreateFolder_(root, '_Brand');
  var oldId = getScriptProps_().getProperty(PROP.LOGO_FILE_ID);
  if (oldId) {
    try { DriveApp.getFileById(oldId).setTrashed(true); } catch (e) {}
  }
  var file = brandFolder.createFile(blob);
  try {
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  } catch (e) {
    // consumer accounts may restrict; data-URL fallback still works via bootstrap
  }
  getScriptProps_().setProperty(PROP.LOGO_FILE_ID, file.getId());
  return file.getId();
}

function getLogoDataUrl_() {
  var id = getScriptProps_().getProperty(PROP.LOGO_FILE_ID);
  if (!id) return '';
  try {
    var blob = DriveApp.getFileById(id).getBlob();
    return 'data:' + blob.getContentType() + ';base64,' + Utilities.base64Encode(blob.getBytes());
  } catch (e) {
    return '';
  }
}

function getBranding_() {
  var slogan = getScriptProps_().getProperty(PROP.ORG_SLOGAN) || ORG_SLOGAN_DEFAULT;
  return {
    orgName: ORG_NAME,
    slogan: slogan,
    logoDataUrl: getLogoDataUrl_(),
    logoFileId: getScriptProps_().getProperty(PROP.LOGO_FILE_ID) || ''
  };
}

function getSetupState_() {
  ensureDb_();
  var ctx = getUserContext_();
  var roleMap = getRoleMap_();
  var roles = {};
  OFFICER_ROLES.forEach(function (r) {
    roles[r] = roleMap[r] || { email: '', whatsapp: '' };
  });
  var webAppUrl = getWebAppUrl_();
  return {
    setupDone: getScriptProps_().getProperty(PROP.SETUP_DONE) === '1',
    roles: roles,
    roleLabels: ROLE_LABELS,
    officerRoles: OFFICER_ROLES,
    members: listMembers_().map(function (m) {
      return { name: m.name, email: m.email, whatsapp: m.whatsapp };
    }),
    branding: getBranding_(),
    whatsappMode: getScriptProps_().getProperty(PROP.WHATSAPP_MODE) || 'off',
    whatsappWebhookUrl: getScriptProps_().getProperty(PROP.WHATSAPP_WEBHOOK_URL) || '',
    rootFolderId: getScriptProps_().getProperty(PROP.ROOT_FOLDER_ID) || '',
    dbSpreadsheetId: getScriptProps_().getProperty(PROP.DB_SPREADSHEET_ID) || '',
    webAppUrl: webAppUrl,
    accountChooserUrl: webAppUrl
      ? 'https://accounts.google.com/AccountChooser?continue=' + encodeURIComponent(webAppUrl)
      : '',
    context: {
      email: ctx.email,
      roles: ctx.roles,
      isAdmin: ctx.isAdmin
    },
    docTypes: Object.keys(DOC_TYPES).map(function (k) {
      var d = DOC_TYPES[k];
      return {
        key: d.key,
        label: d.label,
        stages: d.stages,
        submitRoles: d.submitRoles,
        editRoles: d.editRoles
      };
    })
  };
}

function ensureReminderTrigger_() {
  var triggers = ScriptApp.getProjectTriggers();
  var exists = triggers.some(function (t) {
    return t.getHandlerFunction() === 'dailyReminderJob';
  });
  if (!exists) {
    ScriptApp.newTrigger('dailyReminderJob').timeBased().everyDays(1).atHour(9).create();
  }
}
