/**
 * Web app entry + API surface for google.script.run
 */

function doGet(e) {
  // Keep first paint fast: never open/create Drive DB or fetch logo blobs here.
  var template = HtmlService.createTemplateFromFile('Index');
  var webAppUrl = '';
  try { webAppUrl = getWebAppUrl_(); } catch (err) {}
  if (!webAppUrl) {
    try { webAppUrl = ScriptApp.getService().getUrl() || ''; } catch (err2) {}
  }
  webAppUrl = String(webAppUrl || '').replace(/\/macros\/u\/\d+\//, '/macros/');
  var branding = getBrandingLight_();
  template.initial = JSON.stringify({
    appName: APP_NAME,
    orgName: ORG_NAME,
    branding: branding,
    webAppUrl: webAppUrl,
    accountChooserUrl: webAppUrl
      ? 'https://accounts.google.com/AccountChooser?continue=' + encodeURIComponent(webAppUrl) + '&prompt=select_account'
      : '',
    user: safeContext_()
  });
  return template
    .evaluate()
    .setTitle(ORG_NAME)
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

function safeContext_() {
  try {
    // Avoid Drive I/O on first paint — only report session email if present
    var email = getActiveUserEmail_();
    return {
      email: email,
      roles: [],
      isAdmin: false,
      setupDone: getScriptProps_().getProperty(PROP.SETUP_DONE) === '1'
    };
  } catch (err) {
    return { email: '', roles: [], isAdmin: false, setupDone: false, error: String(err.message || err) };
  }
}

/** ——— Client API ——— */

/** No auth — used so the page can show logo + account chooser even when sign-in fails */
function apiGetPublicConfig() {
  return withError_(function () {
    var webAppUrl = getWebAppUrl_();
    if (!webAppUrl) {
      try { webAppUrl = ScriptApp.getService().getUrl() || ''; } catch (e) {}
    }
    webAppUrl = String(webAppUrl || '').replace(/\/macros\/u\/\d+\//, '/macros/');
    var branding = getBrandingLight_();
    return {
      appName: APP_NAME,
      orgName: ORG_NAME,
      branding: branding,
      webAppUrl: webAppUrl,
      accountChooserUrl: webAppUrl
        ? 'https://accounts.google.com/AccountChooser?continue=' + encodeURIComponent(webAppUrl) + '&prompt=select_account'
        : '',
      setupDone: getScriptProps_().getProperty(PROP.SETUP_DONE) === '1' &&
        !!getScriptProps_().getProperty(PROP.DB_SPREADSHEET_ID),
      identityRequired: !getActiveUserEmail_()
    };
  });
}

function apiRequestLoginCode(email) {
  return withError_(function () {
    return requestLoginCode_(email);
  });
}

function apiVerifyLoginCode(email, code) {
  return withError_(function () {
    var ctx = verifyLoginCode_(email, code);
    // Skip items on verify so login stays fast; client refreshes the list after
    return {
      context: {
        email: ctx.email,
        roles: ctx.roles,
        isAdmin: ctx.isAdmin,
        setupDone: ctx.setupDone
      },
      bootstrap: buildBootstrapPayload_({ skipItems: true })
    };
  });
}

function apiLogoutSession() {
  return withError_(function () {
    clearCachedSessionEmail_();
    return { ok: true };
  });
}

/** Fast — clears stale Drive/DB pointers after a manual wipe (no Drive I/O). */
function apiResetStaleLinks() {
  return withError_(function () {
    clearCachedSessionEmail_();
    var props = getScriptProps_();
    props.deleteProperty(PROP.DB_SPREADSHEET_ID);
    props.deleteProperty(PROP.ROOT_FOLDER_ID);
    props.deleteProperty(PROP.LOGO_FILE_ID);
    props.setProperty(PROP.SETUP_DONE, '0');
    return {
      ok: true,
      message: 'Cleared saved Drive/DB links. Sign in with the group Gmail only to recreate folders; set Admin to a personal Gmail, then use that Admin account for Admin work.'
    };
  });
}

function buildBootstrapPayload_(opt) {
  // Always reload roles from the DB for the current OTP session
  var ctx = getUserContext_();
  var setup = getSetupState_();
  setup.context = {
    email: ctx.email,
    roles: ctx.roles,
    isAdmin: ctx.isAdmin
  };
  var items = [];
  var includeItems = !(opt && opt.skipItems);
  if (setup.setupDone && includeItems) {
    try {
      items = listEnrichedItems_({});
    } catch (eItems) {
      items = [];
    }
  }
  return {
    appName: APP_NAME,
    orgName: ORG_NAME,
    setup: setup,
    branding: setup.branding,
    context: {
      email: ctx.email,
      roles: ctx.roles,
      isAdmin: ctx.isAdmin,
      setupDone: ctx.setupDone
    },
    items: items,
    canSubmit: {
      requisition: canSubmitType_(ctx, 'requisition'),
      minutes: canSubmitType_(ctx, 'minutes'),
      proof_of_payment: canSubmitType_(ctx, 'proof_of_payment')
    }
  };
}

function apiGetBootstrap() {
  return withError_(function () {
    requireKnownUser_();
    return buildBootstrapPayload_({});
  });
}

function apiRunInitialSetup() {
  return withError_(function () {
    return runInitialSetup();
  });
}

function apiSaveRoles(payload) {
  return withError_(function () {
    return saveRoles_(payload);
  });
}

function apiListItems(filter) {
  return withError_(function () {
    return { items: listEnrichedItems_(filter || {}) };
  });
}

function apiSubmitItem(payload) {
  return withError_(function () {
    return { item: submitItem_(payload) };
  });
}

function apiApprove(itemId, note) {
  return withError_(function () {
    return { item: approveItem_(itemId, note) };
  });
}

function apiDecline(itemId, note) {
  return withError_(function () {
    return { item: declineItem_(itemId, note) };
  });
}

function apiDeleteItem(itemId) {
  return withError_(function () {
    return deleteItem_(itemId);
  });
}

function apiArchiveItem(itemId) {
  return withError_(function () {
    return { item: archiveItem_(itemId) };
  });
}

function apiUnarchiveItem(itemId) {
  return withError_(function () {
    return { item: unarchiveItem_(itemId) };
  });
}

function apiForceApprove(itemId, note) {
  return withError_(function () {
    return { item: adminForceApprove_(itemId, note) };
  });
}

function apiSkipStage(itemId, note) {
  return withError_(function () {
    return { item: adminSkipStage_(itemId, note) };
  });
}

function apiEditReplace(itemId, payload) {
  return withError_(function () {
    return { item: editReplaceFile_(itemId, payload) };
  });
}

function apiReopen(itemId) {
  return withError_(function () {
    return { item: reopenItem_(itemId) };
  });
}

function apiSaveWebAppUrl(url) {
  return withError_(function () {
    getScriptProps_().setProperty(PROP.WEB_APP_URL, String(url || '').trim());
    return { ok: true, webAppUrl: getWebAppUrl_() };
  });
}

function withError_(fn) {
  try {
    var data = fn();
    return { ok: true, data: data };
  } catch (e) {
    return { ok: false, error: String(e.message || e) };
  }
}
