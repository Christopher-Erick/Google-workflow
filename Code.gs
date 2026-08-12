/**
 * Web app entry + API surface for google.script.run
 */

function doGet(e) {
  ensureDb_();
  var template = HtmlService.createTemplateFromFile('Index');
  template.initial = JSON.stringify({
    appName: APP_NAME,
    user: safeContext_()
  });
  return template
    .evaluate()
    .setTitle(APP_NAME)
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
      setup: setup,
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
