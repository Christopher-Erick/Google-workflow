/**
 * One-time / admin setup: roles, Drive tree, reminder trigger
 */

function runInitialSetup() {
  ensureDb_();
  ensureDriveTree_();
  ensureReminderTrigger_();
  return {
    ok: true,
    message: 'Database, Drive folders, and reminder trigger are ready. Save roles next.'
  };
}

function saveRoles_(payload) {
  var ctx = getUserContext_();
  // First-time setup: allow whoever is deploying (group account / secretary)
  var setupDone = getScriptProps_().getProperty(PROP.SETUP_DONE) === '1';
  if (setupDone && !ctx.isAdmin) {
    throw new Error('Only admin/secretary can update roles after setup.');
  }

  ensureDb_();
  ensureDriveTree_();

  var sheet = getDb_().getSheetByName(SHEETS.ROLES);
  // Clear existing role rows (keep header)
  var last = sheet.getLastRow();
  if (last > 1) {
    sheet.deleteRows(2, last - 1);
  }

  var now = nowIso_();
  var rolesPayload = payload.roles || {};

  ROLES.forEach(function (role) {
    var entry = rolesPayload[role] || {};
    var email = String(entry.email || '').trim();
    var whatsapp = String(entry.whatsapp || '').trim();
    if (role !== 'members' && email && email.indexOf('@') < 0) {
      throw new Error('Invalid email for ' + role);
    }
    sheet.appendRow([role, email, whatsapp, now]);
  });

  // Default admin = secretary if admin blank
  var roleMap = getRoleMap_();
  if (!roleMap.admin.email && roleMap.secretary.email) {
    // update admin row
    var rows = sheetToObjects_(sheet);
    for (var i = 0; i < rows.length; i++) {
      if (rows[i].role === 'admin') {
        sheet.getRange(rows[i]._row, 2).setValue(roleMap.secretary.email);
      }
    }
  }

  if (payload.webAppUrl) {
    getScriptProps_().setProperty(PROP.WEB_APP_URL, String(payload.webAppUrl).trim());
  }

  getScriptProps_().setProperty(PROP.SETUP_DONE, '1');
  ensureReminderTrigger_();
  audit_('', 'roles_saved', ctx.email, {});

  return { ok: true, setupDone: true, context: getUserContext_() };
}

function getSetupState_() {
  ensureDb_();
  var ctx = getUserContext_();
  var roleMap = getRoleMap_();
  var roles = {};
  ROLES.forEach(function (r) {
    roles[r] = roleMap[r] || { email: '', whatsapp: '' };
  });
  return {
    setupDone: getScriptProps_().getProperty(PROP.SETUP_DONE) === '1',
    roles: roles,
    roleLabels: ROLE_LABELS,
    rootFolderId: getScriptProps_().getProperty(PROP.ROOT_FOLDER_ID) || '',
    dbSpreadsheetId: getScriptProps_().getProperty(PROP.DB_SPREADSHEET_ID) || '',
    webAppUrl: getWebAppUrl_(),
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
