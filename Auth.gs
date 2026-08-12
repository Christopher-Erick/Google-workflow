/**
 * Role & permission helpers
 */

function getRoleMap_() {
  var rows = sheetToObjects_(getDb_().getSheetByName(SHEETS.ROLES));
  var map = {};
  OFFICER_ROLES.forEach(function (role) {
    map[role] = { email: '', whatsapp: '' };
  });
  rows.forEach(function (r) {
    var role = String(r.role || '').trim();
    if (OFFICER_ROLES.indexOf(role) < 0) return;
    map[role] = {
      email: String(r.email || '').trim().toLowerCase(),
      whatsapp: String(r.whatsapp || '').trim()
    };
  });
  return map;
}

function listMembers_() {
  ensureDb_();
  return sheetToObjects_(getDb_().getSheetByName(SHEETS.MEMBERS)).map(function (m) {
    return {
      name: String(m.name || '').trim(),
      email: String(m.email || '').trim().toLowerCase(),
      whatsapp: String(m.whatsapp || '').trim(),
      _row: m._row
    };
  }).filter(function (m) {
    return m.email || m.whatsapp;
  });
}

function getActiveUserEmail_() {
  var email = Session.getActiveUser().getEmail();
  if (!email) email = Session.getEffectiveUser().getEmail();
  return String(email || '').trim().toLowerCase();
}

function getUserContext_() {
  ensureDb_();
  var email = getActiveUserEmail_();
  var roles = getRoleMap_();
  var myRoles = [];
  OFFICER_ROLES.forEach(function (role) {
    if (roles[role] && roles[role].email && roles[role].email === email) {
      myRoles.push(role);
    }
  });
  var members = listMembers_();
  var isMember = members.some(function (m) { return m.email && m.email === email; });
  if (isMember && myRoles.indexOf('members') < 0) myRoles.push('members');

  // Admin and Secretary are separate people/roles — never conflate them.
  var isAdmin = !!(roles.admin && roles.admin.email && roles.admin.email === email);

  var setupDone = getScriptProps_().getProperty(PROP.SETUP_DONE) === '1';
  var known = myRoles.length > 0;
  // Before setup completes, allow the deploying user in
  if (!setupDone) known = true;

  return {
    email: email,
    roles: myRoles,
    isAdmin: isAdmin,
    isKnownUser: known,
    roleMap: roles,
    setupDone: setupDone
  };
}

function requireKnownUser_() {
  var ctx = getUserContext_();
  if (!ctx.email) {
    throw new Error(
      'Google did not share your email (often happens with multiple accounts signed in). ' +
      'Open the web app in Incognito, or a Chrome profile with only your roster Gmail, ' +
      'or use the Account Chooser link from Setup.'
    );
  }
  if (ctx.setupDone && !ctx.isKnownUser) {
    throw new Error(
      'Your Google account (' + ctx.email + ') is not on the SHE roster. ' +
      'Ask Admin to add this email under Officers or Members in Setup, then refresh.'
    );
  }
  return ctx;
}

function userHasRole_(ctx, role) {
  return ctx.roles.indexOf(role) >= 0;
}

function canSubmitType_(ctx, typeKey) {
  var def = getDocType_(typeKey);
  for (var i = 0; i < def.submitRoles.length; i++) {
    if (ctx.roles.indexOf(def.submitRoles[i]) >= 0) return true;
  }
  return false;
}

function canEditItem_(ctx, item) {
  var def = getDocType_(item.type);
  for (var i = 0; i < def.editRoles.length; i++) {
    if (ctx.roles.indexOf(def.editRoles[i]) >= 0) return true;
  }
  return false;
}

function canActOnCurrentStage_(ctx, item) {
  if (item.status !== ITEM_STATUS.PENDING) return false;
  var role = item.current_stage_role;
  if (!role) return false;
  if (ctx.roles.indexOf(role) >= 0) return true;
  return false;
}

function requireSetup_() {
  if (getScriptProps_().getProperty(PROP.SETUP_DONE) !== '1') {
    throw new Error('Setup is not complete. Open Setup and save roles first.');
  }
}

function allNotificationEmails_(roleMap) {
  var set = {};
  OFFICER_ROLES.forEach(function (role) {
    if (roleMap[role] && roleMap[role].email) set[roleMap[role].email] = true;
  });
  listMembers_().forEach(function (m) {
    if (m.email) set[m.email] = true;
  });
  return Object.keys(set);
}

function allNotificationPhones_(roleMap) {
  var set = {};
  OFFICER_ROLES.forEach(function (role) {
    var phone = normalizePhone_(roleMap[role] && roleMap[role].whatsapp);
    if (phone) set[phone] = true;
  });
  listMembers_().forEach(function (m) {
    var phone = normalizePhone_(m.whatsapp);
    if (phone) set[phone] = true;
  });
  return Object.keys(set);
}

function emailsForRoles_(roleMap, roleKeys) {
  var out = [];
  (roleKeys || []).forEach(function (role) {
    if (roleMap[role] && roleMap[role].email) out.push(roleMap[role].email);
  });
  return out;
}

function phonesForRoles_(roleMap, roleKeys) {
  var out = [];
  (roleKeys || []).forEach(function (role) {
    var phone = normalizePhone_(roleMap[role] && roleMap[role].whatsapp);
    if (phone) out.push(phone);
  });
  return out;
}

function normalizePhone_(raw) {
  var s = String(raw || '').trim();
  if (!s) return '';
  s = s.replace(/[\s()-]/g, '');
  if (s.charAt(0) !== '+' && /^\d+$/.test(s)) {
    // keep digits; caller may store with country code already
  }
  return s;
}
