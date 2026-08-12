/**
 * Role & permission helpers
 */

function getRoleMap_() {
  var rows = sheetToObjects_(getDb_().getSheetByName(SHEETS.ROLES));
  var map = {};
  rows.forEach(function (r) {
    map[r.role] = {
      email: String(r.email || '').trim().toLowerCase(),
      whatsapp: String(r.whatsapp || '').trim()
    };
  });
  return map;
}

function getActiveUserEmail_() {
  var email = Session.getActiveUser().getEmail();
  if (!email) email = Session.getEffectiveUser().getEmail();
  return String(email || '').trim().toLowerCase();
}

function parseMemberEmails_(raw) {
  return String(raw || '')
    .split(/[,;\n]+/)
    .map(function (e) { return e.trim().toLowerCase(); })
    .filter(function (e) { return e && e.indexOf('@') > 0; });
}

function getUserContext_() {
  ensureDb_();
  var email = getActiveUserEmail_();
  var roles = getRoleMap_();
  var myRoles = [];
  Object.keys(roles).forEach(function (role) {
    if (role === 'members') {
      if (parseMemberEmails_(roles.members.email).indexOf(email) >= 0) {
        myRoles.push('members');
      }
    } else if (roles[role].email && roles[role].email === email) {
      myRoles.push(role);
    }
  });
  var isAdmin = myRoles.indexOf('admin') >= 0 || myRoles.indexOf('secretary') >= 0;
  // Admin role email OR secretary acts as overlay admin per spec
  if (roles.admin && roles.admin.email === email) isAdmin = true;
  if (roles.secretary && roles.secretary.email === email) isAdmin = true;

  var setupDone = getScriptProps_().getProperty(PROP.SETUP_DONE) === '1';
  var known = myRoles.length > 0 || isAdmin;
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
    throw new Error('Sign in with your Google account to use this workflow.');
  }
  if (ctx.setupDone && !ctx.isKnownUser) {
    throw new Error('Your email is not on the SHE workflow roster. Ask the secretary/admin to add you in Setup.');
  }
  return ctx;
}

function userHasRole_(ctx, role) {
  return ctx.roles.indexOf(role) >= 0 || (role !== 'admin' && ctx.isAdmin && role === 'admin');
}

function canSubmitType_(ctx, typeKey) {
  if (ctx.isAdmin && typeKey === 'minutes') return true;
  var def = getDocType_(typeKey);
  for (var i = 0; i < def.submitRoles.length; i++) {
    if (ctx.roles.indexOf(def.submitRoles[i]) >= 0) return true;
  }
  return false;
}

function canEditItem_(ctx, item) {
  if (ctx.isAdmin && item.type !== 'requisition') {
    // Admin/secretary can edit minutes & proof; requisition also needs patron path
  }
  var def = getDocType_(item.type);
  for (var i = 0; i < def.editRoles.length; i++) {
    if (ctx.roles.indexOf(def.editRoles[i]) >= 0) return true;
  }
  // Secretary always in editRoles for all types per latest answers for minutes/proof;
  // requisition includes secretary + patron already.
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
  ROLES.forEach(function (role) {
    if (!roleMap[role]) return;
    if (role === 'members') {
      parseMemberEmails_(roleMap.members.email).forEach(function (e) {
        set[e] = true;
      });
    } else if (roleMap[role].email) {
      set[roleMap[role].email] = true;
    }
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
