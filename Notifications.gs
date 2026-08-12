/**
 * Email + WhatsApp notifications
 */

function sendMail_(toList, subject, htmlBody, urgent) {
  var recipients = uniqueEmails_(toList);
  if (!recipients.length) return;
  var options = {
    htmlBody: htmlBody,
    name: APP_NAME
  };
  if (urgent) {
    options.headers = { 'X-Priority': '1', 'X-MSMail-Priority': 'High', Importance: 'High' };
  }
  try {
    GmailApp.sendEmail(recipients.join(','), subject, stripHtml_(htmlBody), options);
  } catch (e) {
    MailApp.sendEmail({
      to: recipients.join(','),
      subject: (urgent ? '[URGENT] ' : '') + subject,
      htmlBody: htmlBody,
      name: APP_NAME
    });
  }
}

function uniqueEmails_(list) {
  var set = {};
  (list || []).forEach(function (e) {
    e = String(e || '').trim().toLowerCase();
    if (e) set[e] = true;
  });
  return Object.keys(set);
}

function stripHtml_(html) {
  return String(html || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * Notify by email and WhatsApp (when configured).
 * WhatsApp modes:
 *  - off: email only
 *  - webhook: GET/POST WHATSAPP_WEBHOOK_URL with {{phone}} and {{text}} placeholders
 */
function notifyChannels_(emails, phones, subject, htmlBody, urgent) {
  sendMail_(emails, subject, htmlBody, urgent);
  var text = (urgent ? '[URGENT] ' : '') + subject + '\n\n' + stripHtml_(htmlBody);
  sendWhatsAppBulk_(phones, text);
}

function sendWhatsAppBulk_(phones, text) {
  var mode = String(getScriptProps_().getProperty(PROP.WHATSAPP_MODE) || 'off').toLowerCase();
  if (mode === 'off' || mode === '') return;
  var list = [];
  var seen = {};
  (phones || []).forEach(function (p) {
    p = normalizePhone_(p);
    if (p && !seen[p]) {
      seen[p] = true;
      list.push(p);
    }
  });
  if (!list.length) return;

  if (mode === 'webhook') {
    var template = getScriptProps_().getProperty(PROP.WHATSAPP_WEBHOOK_URL) || '';
    if (!template) return;
    list.forEach(function (phone) {
      try {
        sendWhatsAppWebhook_(template, phone, text);
      } catch (e) {
        console.error('WhatsApp webhook failed for ' + phone + ': ' + e.message);
      }
    });
  }
}

function sendWhatsAppWebhook_(template, phone, text) {
  var phoneEncoded = encodeURIComponent(phone);
  var textEncoded = encodeURIComponent(text);
  var phoneDigits = phone.replace(/[^\d]/g, '');
  var url = String(template)
    .replace(/\{\{phone\}\}/g, phoneEncoded)
    .replace(/\{\{phone_digits\}\}/g, phoneDigits)
    .replace(/\{\{text\}\}/g, textEncoded);

  var usePost = /\{POST\}/i.test(template);
  url = url.replace(/\{POST\}/ig, '');

  if (usePost) {
    UrlFetchApp.fetch(url, {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify({ phone: phone, text: text }),
      muteHttpExceptions: true
    });
  } else {
    UrlFetchApp.fetch(url, { muteHttpExceptions: true });
  }
}

function statusLabel_(item) {
  if (item.status === ITEM_STATUS.ARCHIVED) return 'Archived (Admin/Secretary only)';
  if (item.status === ITEM_STATUS.APPROVED) return 'Fully approved';
  if (item.status === ITEM_STATUS.DECLINED) {
    return 'Declined' + (item.declined_by ? ' by ' + item.declined_by : '');
  }
  var role = item.current_stage_role;
  var label = ROLE_LABELS[role] || role;
  return 'Waiting on ' + label;
}

function stageProgressText_(item) {
  var def = getDocType_(item.type);
  var idx = Number(item.current_stage_index);
  if (item.status === ITEM_STATUS.ARCHIVED) {
    return def.label + ': archived in workflow (Drive file unchanged)';
  }
  if (item.status === ITEM_STATUS.APPROVED) {
    return def.label + ': all stages approved';
  }
  if (item.status === ITEM_STATUS.DECLINED) {
    return def.label + ': declined — process terminated';
  }
  if (idx === 0) return 'Submitted — waiting on ' + (ROLE_LABELS[def.stages[0]] || def.stages[0]);
  var prev = ROLE_LABELS[def.stages[idx - 1]] || def.stages[idx - 1];
  var cur = ROLE_LABELS[def.stages[idx]] || def.stages[idx];
  return prev + ' approved — waiting on ' + cur;
}

function notifySubmitted_(item, ctx) {
  var roleMap = ctx.roleMap || getRoleMap_();
  var allEmails = allNotificationEmails_(roleMap);
  var allPhones = allNotificationPhones_(roleMap);
  var def = getDocType_(item.type);
  var progress = stageProgressText_(item);
  var url = getWebAppUrl_();
  var submitterName = displayNameForEmail_(item.submitter_email, roleMap);
  var waitingName = item.current_stage_role ? displayNameForRole_(item.current_stage_role, roleMap) : '';
  var html =
    '<p>A new <b>' + def.label + '</b> has been submitted and is pending approval.</p>' +
    '<p><b>Title:</b> ' + esc_(item.title) + '<br>' +
    '<b>Submitted by:</b> ' + esc_(submitterName) + ' &lt;' + esc_(item.submitter_email) + '&gt;<br>' +
    '<b>Status:</b> ' + esc_(progress) +
    (waitingName ? '<br><b>Waiting on:</b> ' + esc_(waitingName) : '') +
    '</p>' +
    '<p><a href="' + url + '">Open workflow</a></p>';

  notifyChannels_(allEmails, allPhones, '[' + APP_NAME + '] New ' + def.label + ': ' + item.title, html, false);

  var urgentEmails = emailsForRoles_(roleMap, [item.current_stage_role]);
  var urgentPhones = phonesForRoles_(roleMap, [item.current_stage_role]);
  var urgentHtml =
    '<p><b>Action required' + (waitingName ? ' (' + esc_(waitingName) + ')' : '') + ':</b> Please review and approve or decline.</p>' +
    '<p><b>' + def.label + ':</b> ' + esc_(item.title) + '<br>' +
    '<b>Submitted by:</b> ' + esc_(submitterName) + '<br>' +
    '<b>Status:</b> ' + esc_(progress) + '</p>' +
    '<p><a href="' + url + '">Review now</a></p>';
  notifyChannels_(urgentEmails, urgentPhones, '[URGENT] Approve ' + def.label + ': ' + item.title, urgentHtml, true);
}

function notifyStageUpdate_(item, actorEmail, action) {
  var roleMap = getRoleMap_();
  var allEmails = allNotificationEmails_(roleMap);
  var allPhones = allNotificationPhones_(roleMap);
  var def = getDocType_(item.type);
  var progress = stageProgressText_(item);
  var url = getWebAppUrl_();
  var actorName = displayNameForEmail_(actorEmail, roleMap);
  var subject;
  var html;

  if (action === 'declined') {
    subject = '[' + APP_NAME + '] ' + def.label + ' declined: ' + item.title;
    html =
      '<p>The <b>' + def.label + '</b> <b>' + esc_(item.title) + '</b> was <b>declined</b>.</p>' +
      '<p><b>By:</b> ' + esc_(actorName) + ' &lt;' + esc_(actorEmail) + '&gt;<br>' +
      '<b>Reason:</b> ' + esc_(item.decline_note || '') + '</p>' +
      '<p>The process has been terminated. The submitter may reopen or submit a new item.</p>' +
      '<p><a href="' + url + '">Open workflow</a></p>';
    notifyChannels_(allEmails, allPhones, subject, html, false);
    return;
  }

  if (action === 'approved_final') {
    subject = '[' + APP_NAME + '] ' + def.label + ' fully approved: ' + item.title;
    html =
      '<p>The <b>' + def.label + '</b> <b>' + esc_(item.title) + '</b> is <b>fully approved</b>.</p>' +
      '<p><b>Last recorded approver:</b> ' + esc_(actorName) + '</p>' +
      '<p><a href="' + item.file_url + '">View document</a> · <a href="' + url + '">Open workflow</a></p>';
    notifyChannels_(allEmails, allPhones, subject, html, false);
    return;
  }

  if (action === 'reset') {
    subject = '[' + APP_NAME + '] ' + def.label + ' reset after edit: ' + item.title;
    html =
      '<p>The document was edited. <b>All prior approvals were reset</b> and the process restarted.</p>' +
      '<p><b>' + def.label + ':</b> ' + esc_(item.title) + '<br>' +
      '<b>Edited by:</b> ' + esc_(actorName) + ' &lt;' + esc_(actorEmail) + '&gt;<br>' +
      '<b>Status:</b> ' + esc_(progress) + '</p>' +
      '<p><a href="' + url + '">Open workflow</a></p>';
    notifyChannels_(allEmails, allPhones, subject, html, false);
    notifyChannels_(
      emailsForRoles_(roleMap, [item.current_stage_role]),
      phonesForRoles_(roleMap, [item.current_stage_role]),
      '[URGENT] Re-approve after edit: ' + item.title,
      '<p>Approvals were reset. Please review again.</p><p><a href="' + url + '">Review now</a></p>',
      true
    );
    return;
  }

  var waitingName = item.current_stage_role ? displayNameForRole_(item.current_stage_role, roleMap) : '';
  subject = '[' + APP_NAME + '] ' + progress + ' — ' + item.title;
  html =
    '<p>Approval update for <b>' + esc_(item.title) + '</b> (' + def.label + ').</p>' +
    '<p><b>Status:</b> ' + esc_(progress) + '<br>' +
    '<b>Recorded action by:</b> ' + esc_(actorName) + ' &lt;' + esc_(actorEmail) + '&gt;' +
    (waitingName ? '<br><b>Now waiting on:</b> ' + esc_(waitingName) : '') +
    '</p>' +
    '<p><a href="' + url + '">Open workflow</a></p>';
  notifyChannels_(allEmails, allPhones, subject, html, false);

  if (item.status === ITEM_STATUS.PENDING && item.current_stage_role) {
    notifyChannels_(
      emailsForRoles_(roleMap, [item.current_stage_role]),
      phonesForRoles_(roleMap, [item.current_stage_role]),
      '[URGENT] Your approval needed: ' + item.title,
      '<p><b>Action required' + (waitingName ? ' (' + esc_(waitingName) + ')' : '') + '.</b></p><p>' + esc_(progress) + '</p><p><a href="' + url + '">Review now</a></p>',
      true
    );
  }
}

function notifyReminder_(item) {
  var roleMap = getRoleMap_();
  var progress = stageProgressText_(item);
  var url = getWebAppUrl_();
  notifyChannels_(
    emailsForRoles_(roleMap, [item.current_stage_role]),
    phonesForRoles_(roleMap, [item.current_stage_role]),
    '[REMINDER] Pending ' + REMINDER_DAYS + '+ days: ' + item.title,
    '<p>This item has been waiting for your action for at least <b>' + REMINDER_DAYS + ' days</b>.</p>' +
      '<p><b>Status:</b> ' + esc_(progress) + '</p>' +
      '<p><a href="' + url + '">Review now</a></p>',
    true
  );
}

function esc_(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function getWebAppUrl_() {
  var stored = getScriptProps_().getProperty(PROP.WEB_APP_URL);
  if (stored) return stored;
  try {
    return ScriptApp.getService().getUrl() || '';
  } catch (e) {
    return '';
  }
}
