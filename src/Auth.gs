/**
 * Role & permission helpers
 */

/** Request-local caches (Apps Script resets each invocation). */
var _nazRoleMapCache = null;
var _nazMembersCache = null;

function getRoleMap_() {
  if (_nazRoleMapCache) return _nazRoleMapCache;
  var ss = tryOpenDb_();
  if (!ss) {
    var empty = {};
    OFFICER_ROLES.forEach(function (role) {
      empty[role] = { name: '', email: '', whatsapp: '' };
    });
    _nazRoleMapCache = empty;
    return empty;
  }
  var rows = sheetToObjects_(ss.getSheetByName(SHEETS.ROLES));
  var map = {};
  OFFICER_ROLES.forEach(function (role) {
    map[role] = { name: '', email: '', whatsapp: '' };
  });
  rows.forEach(function (r) {
    var role = String(r.role || '').trim();
    if (OFFICER_ROLES.indexOf(role) < 0) return;
    map[role] = {
      name: String(r.name || '').trim(),
      email: String(r.email || '').trim().toLowerCase(),
      whatsapp: String(r.whatsapp || '').trim()
    };
  });
  _nazRoleMapCache = map;
  return map;
}

function listMembers_() {
  if (_nazMembersCache) return _nazMembersCache;
  var ss = tryOpenDb_();
  if (!ss) {
    _nazMembersCache = [];
    return _nazMembersCache;
  }
  _nazMembersCache = sheetToObjects_(ss.getSheetByName(SHEETS.MEMBERS)).map(function (m) {
    return {
      name: String(m.name || '').trim(),
      email: String(m.email || '').trim().toLowerCase(),
      whatsapp: String(m.whatsapp || '').trim(),
      _row: m._row
    };
  }).filter(function (m) {
    return m.email || m.whatsapp;
  });
  return _nazMembersCache;
}

function clearRosterCaches_() {
  _nazRoleMapCache = null;
  _nazMembersCache = null;
}

function getActiveUserEmail_() {
  // OTP session is the source of truth for this app (multi-account Chrome often
  // returns the wrong ActiveUser, which dropped Admin/Secretary roles after login).
  var cached = getCachedSessionEmail_();
  if (cached) return cached;

  var email = '';
  try {
    email = Session.getActiveUser().getEmail();
  } catch (e) {
    email = '';
  }
  return String(email || '').trim().toLowerCase();
}

function getScriptOwnerEmail_() {
  try {
    return String(Session.getEffectiveUser().getEmail() || '').trim().toLowerCase();
  } catch (e) {
    return '';
  }
}

/** True when this session is the personal Admin officer (never the group inbox). */
function isPersonalAdmin_(ctx) {
  if (!ctx || !ctx.isAdmin || !ctx.email) return false;
  var owner = getScriptOwnerEmail_();
  if (owner && ctx.email === owner) return false;
  return true;
}

/**
 * First-time infra/setup: script-owner group Gmail.
 * After setup: personal Admin Gmail only (not group mail).
 */
function requireAdminOperation_(allowFirstSetupOwner) {
  var ctx = requireKnownUser_();
  var setupDone = ensureSetupFlagFromDb_();
  var owner = getScriptOwnerEmail_();

  if (!setupDone && allowFirstSetupOwner) {
    if (owner && ctx.email === owner) return ctx;
    throw new Error(
      'First-time Create Drive folders / first Save must use the script-owner group Gmail. ' +
      'Set Admin to a different personal Gmail, Save, then Switch account and sign in as that Admin for all Admin work.'
    );
  }

  if (!ctx.isAdmin) {
    throw new Error(
      'Only the personal Admin can do this. Sign in with the Admin officer Gmail (OTP) — not the group inbox.'
    );
  }
  if (owner && ctx.email === owner) {
    throw new Error(
      'Admin operations must use the personal Admin Gmail, not the group inbox that owns the script.'
    );
  }
  return ctx;
}

function getSessionCacheKey_() {
  try {
    var key = Session.getTemporaryActiveUserKey();
    if (key) return 'naz_session_' + key;
  } catch (e) {}
  return '';
}

function getCachedSessionEmail_() {
  var key = getSessionCacheKey_();
  if (!key) return '';
  try {
    return String(CacheService.getUserCache().get(key) || CacheService.getScriptCache().get(key) || '')
      .trim()
      .toLowerCase();
  } catch (e) {
    return '';
  }
}

function setCachedSessionEmail_(email) {
  email = String(email || '').trim().toLowerCase();
  var key = getSessionCacheKey_();
  if (!key || !email) return false;
  // 12 hours
  var ttl = 43200;
  try {
    CacheService.getUserCache().put(key, email, ttl);
  } catch (e) {}
  try {
    CacheService.getScriptCache().put(key, email, ttl);
  } catch (e2) {}
  return true;
}

function clearCachedSessionEmail_() {
  var key = getSessionCacheKey_();
  if (!key) return;
  try { CacheService.getUserCache().remove(key); } catch (e) {}
  try { CacheService.getScriptCache().remove(key); } catch (e2) {}
}

function isEmailOnRoster_(email) {
  email = String(email || '').trim().toLowerCase();
  if (!email || email.indexOf('@') < 0) return false;
  // Recover DB/setup flags if Clear session previously wiped Script Properties by mistake
  var setupDone = ensureSetupFlagFromDb_();
  if (!setupDone) {
    var owner = getScriptOwnerEmail_();
    return !!(owner && owner === email);
  }
  var roleMap = getRoleMap_();
  for (var i = 0; i < OFFICER_ROLES.length; i++) {
    var role = OFFICER_ROLES[i];
    if (roleMap[role] && roleMap[role].email === email) return true;
  }
  return listMembers_().some(function (m) { return m.email === email; });
}

/**
 * If SETUP_DONE was cleared but NAZ Workflow DB still exists on Drive, re-link it
 * so members can log in again without recreating Setup.
 */
function ensureSetupFlagFromDb_() {
  var props = getScriptProps_();
  if (props.getProperty(PROP.SETUP_DONE) === '1' && props.getProperty(PROP.DB_SPREADSHEET_ID)) {
    return true;
  }
  var ss = null;
  try {
    ss = findExistingDbSpreadsheet_();
  } catch (eFind) {
    ss = null;
  }
  if (!ss) return false;
  try {
    var sheet = ss.getSheetByName(SHEETS.ROLES);
    if (!sheet) return false;
    var rows = sheetToObjects_(sheet);
    var hasRole = rows.some(function (r) {
      return String(r.email || '').trim();
    });
    if (!hasRole) return false;
    props.setProperty(PROP.DB_SPREADSHEET_ID, ss.getId());
    props.setProperty(PROP.SETUP_DONE, '1');
    return true;
  } catch (e) {
    return false;
  }
}

/**
 * Resolve a display name for emails used in history, UI, and notifications.
 */
function displayNameForEmail_(email, roleMap) {
  email = String(email || '').trim().toLowerCase();
  if (!email) return 'Unknown';
  roleMap = roleMap || getRoleMap_();
  for (var i = 0; i < OFFICER_ROLES.length; i++) {
    var role = OFFICER_ROLES[i];
    if (roleMap[role] && roleMap[role].email === email) {
      if (roleMap[role].name) return roleMap[role].name;
      break;
    }
  }
  var members = listMembers_();
  for (var m = 0; m < members.length; m++) {
    if (members[m].email === email && members[m].name) return members[m].name;
  }
  return email.split('@')[0];
}

function displayNameForRole_(role, roleMap) {
  roleMap = roleMap || getRoleMap_();
  if (roleMap[role] && roleMap[role].name) return roleMap[role].name;
  if (roleMap[role] && roleMap[role].email) return displayNameForEmail_(roleMap[role].email, roleMap);
  return ROLE_LABELS[role] || role;
}

function requestLoginCode_(email) {
  email = String(email || '').trim().toLowerCase();
  if (!email || email.indexOf('@') < 0) {
    throw new Error('Enter a valid Gmail address.');
  }
  // Do not create the DB just to send a code — that made login very slow after a wipe.
  if (!isEmailOnRoster_(email)) {
    throw new Error('That email is not on the SHE roster. Ask Admin to add it in Setup first.');
  }
  var code = String(Math.floor(100000 + Math.random() * 900000));
  var cacheKey = 'naz_login_code_' + email;
  CacheService.getScriptCache().put(cacheKey, code, 600); // 10 minutes
  MailApp.sendEmail({
    to: email,
    subject: '[' + APP_NAME + '] Login code: ' + code,
    body:
      'Your login code for ' + APP_NAME + ' is:\n\n' +
      code +
      '\n\nIt expires in 10 minutes.\n' +
      'If you did not request this, ignore this email.\n'
  });
  return { sent: true, email: email, expiresInMinutes: 10 };
}

function verifyLoginCode_(email, code) {
  email = String(email || '').trim().toLowerCase();
  code = String(code || '').trim();
  if (!email || !code) throw new Error('Email and code are required.');
  if (!isEmailOnRoster_(email)) {
    throw new Error('That email is not on the SHE roster.');
  }
  var cacheKey = 'naz_login_code_' + email;
  var expected = CacheService.getScriptCache().get(cacheKey);
  if (!expected || expected !== code) {
    throw new Error('Invalid or expired code. Request a new one.');
  }
  CacheService.getScriptCache().remove(cacheKey);
  if (!setCachedSessionEmail_(email)) {
    throw new Error('Could not create a browser session. Try Incognito or a single-account Chrome profile.');
  }
  try { audit_('', 'otp_login', email, {}); } catch (eAudit) {}
  // Full role context from the Roles/Members sheets (Admin, Secretary, etc.)
  return getUserContext_();
}

function getUserContext_() {
  var email = getActiveUserEmail_();
  var setupDone = ensureSetupFlagFromDb_();

  // Pre-setup / wiped DB: never touch Sheets/Drive
  if (!setupDone) {
    return {
      email: email,
      roles: [],
      isAdmin: false,
      isKnownUser: true,
      roleMap: {},
      setupDone: false
    };
  }

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

  var isAdmin = !!(roles.admin && roles.admin.email && roles.admin.email === email);
  // Group inbox must never count as Admin even if mis-configured
  var owner = getScriptOwnerEmail_();
  if (isAdmin && owner && email === owner) {
    isAdmin = false;
  }
  var known = myRoles.length > 0;

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
      'IDENTITY_REQUIRED: Enter your roster Gmail and the login code we email you. ' +
      'Chrome is not sharing which Google account you are using (common with several accounts signed in).'
    );
  }
  if (ctx.setupDone && !ctx.isKnownUser) {
    throw new Error(
      'Your Google account (' + ctx.email + ') is not on the SHE roster. ' +
      'Ask Admin to add this personal email under Officers or Members in Setup, then refresh. ' +
      'Day-to-day Admin/officer work should use personal Gmail, not the group inbox.'
    );
  }
  return ctx;
}

function userHasRole_(ctx, role) {
  return ctx.roles.indexOf(role) >= 0;
}

function canSubmitType_(ctx, typeKey) {
  if (ctx.isAdmin) return true;
  var def = getDocType_(typeKey);
  for (var i = 0; i < def.submitRoles.length; i++) {
    if (ctx.roles.indexOf(def.submitRoles[i]) >= 0) return true;
  }
  return false;
}

function canEditItem_(ctx, item) {
  if (ctx.isAdmin) return true;
  var def = getDocType_(item.type);
  for (var i = 0; i < def.editRoles.length; i++) {
    if (ctx.roles.indexOf(def.editRoles[i]) >= 0) return true;
  }
  return false;
}

function canActOnCurrentStage_(ctx, item) {
  if (item.status !== ITEM_STATUS.PENDING) return false;
  if (ctx.isAdmin) return true;
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
