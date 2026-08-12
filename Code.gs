/**
 * Web app entry + API surface for google.script.run
 */

function doGet(e) {
  try {
    ensureDb_();
  } catch (err) {
    // Still serve UI so users don't hit a blank/Drive-style failure on first paint
  }
  var template = HtmlService.createTemplateFromFile('Index');
  var webAppUrl = '';
  try { webAppUrl = getWebAppUrl_(); } catch (err) {}
  if (!webAppUrl) {
    try { webAppUrl = ScriptApp.getService().getUrl() || ''; } catch (err2) {}
  }
  webAppUrl = String(webAppUrl || '').replace(/\/macros\/u\/\d+\//, '/macros/');
  var branding = { orgName: ORG_NAME, slogan: ORG_SLOGAN_DEFAULT, logoDataUrl: '' };
  try { branding = getBranding_(); } catch (err3) {
    try { branding.logoDataUrl = getDefaultLogoDataUrl_(); } catch (err4) {}
  }
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
    ensureDb_();
    var ctx = getUserContext_();
    return {
      email: ctx.email,
      roles: ctx.roles,
      isAdmin: ctx.isAdmin,
      setupDone: ctx.setupDone
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
    var branding = getBranding_();
    return {
      appName: APP_NAME,
      orgName: ORG_NAME,
      branding: branding,
      webAppUrl: webAppUrl,
      accountChooserUrl: webAppUrl
        ? 'https://accounts.google.com/AccountChooser?continue=' + encodeURIComponent(webAppUrl) + '&prompt=select_account'
        : '',
      setupDone: getScriptProps_().getProperty(PROP.SETUP_DONE) === '1',
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
    return {
      context: {
        email: ctx.email,
        roles: ctx.roles,
        isAdmin: ctx.isAdmin,
        setupDone: ctx.setupDone
      }
    };
  });
}

function apiLogoutSession() {
  return withError_(function () {
    clearCachedSessionEmail_();
    return { ok: true };
  });
}

function apiGetBootstrap() {
  return withError_(function () {
    ensureDb_();
    var ctx = requireKnownUser_();
    var setup = getSetupState_();
    var items = [];
    if (setup.setupDone) {
      items = listEnrichedItems_({});
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
