/**
 * Email notifications (WhatsApp stubbed for v2)
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
  // GmailApp supports html; MailApp is simpler for script.send_mail
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

function statusLabel_(item) {
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
  if (item.status === ITEM_STATUS.APPROVED) {
    return def.label + ': all stages approved';
  }
  if (item.status === ITEM_STATUS.DECLINED) {
    return def.label + ': declined — process terminated';
  }
  var parts = [];
  for (var i = 0; i < def.stages.length; i++) {
    var name = ROLE_LABELS[def.stages[i]] || def.stages[i];
    if (i < idx) parts.push(name + ' approved');
    else if (i === idx) parts.push('waiting on ' + name);
    else parts.push(name + ' pending');
  }
  // Human line like: Chair approved — waiting on Patron
  if (idx === 0) return 'Submitted — waiting on ' + (ROLE_LABELS[def.stages[0]] || def.stages[0]);
  var prev = ROLE_LABELS[def.stages[idx - 1]] || def.stages[idx - 1];
  var cur = ROLE_LABELS[def.stages[idx]] || def.stages[idx];
  return prev + ' approved — waiting on ' + cur;
}

function notifySubmitted_(item, ctx) {
  var roleMap = ctx.roleMap;
  var all = allNotificationEmails_(roleMap);
  var def = getDocType_(item.type);
  var progress = stageProgressText_(item);
  var url = getWebAppUrl_();
  var html =
    '<p>A new <b>' + def.label + '</b> has been submitted and is pending approval.</p>' +
    '<p><b>Title:</b> ' + esc_(item.title) + '<br>' +
    '<b>Submitter:</b> ' + esc_(item.submitter_email) + '<br>' +
    '<b>Status:</b> ' + esc_(progress) + '</p>' +
    '<p><a href="' + url + '">Open workflow</a></p>';

  sendMail_(all, '[' + APP_NAME + '] New ' + def.label + ': ' + item.title, html, false);

  // Urgent to current approver(s)
  var urgentTo = emailsForRoles_(roleMap, [item.current_stage_role]);
  var urgentHtml =
    '<p><b>Action required:</b> Please review and approve or decline.</p>' +
    '<p><b>' + def.label + ':</b> ' + esc_(item.title) + '<br>' +
    '<b>Status:</b> ' + esc_(progress) + '</p>' +
    '<p><a href="' + url + '">Review now</a></p>' +
    '<p><i>WhatsApp urgent ping will be enabled in a later version.</i></p>';
  sendMail_(urgentTo, '[URGENT] Approve ' + def.label + ': ' + item.title, urgentHtml, true);
}

function notifyStageUpdate_(item, actorEmail, action) {
  var roleMap = getRoleMap_();
  var all = allNotificationEmails_(roleMap);
  var def = getDocType_(item.type);
  var progress = stageProgressText_(item);
  var url = getWebAppUrl_();
  var subject;
  var html;

  if (action === 'declined') {
    subject = '[' + APP_NAME + '] ' + def.label + ' declined: ' + item.title;
    html =
      '<p>The <b>' + def.label + '</b> <b>' + esc_(item.title) + '</b> was <b>declined</b>.</p>' +
      '<p><b>By:</b> ' + esc_(actorEmail) + '<br>' +
      '<b>Reason:</b> ' + esc_(item.decline_note || '') + '</p>' +
      '<p>The process has been terminated. The submitter may reopen or submit a new item.</p>' +
      '<p><a href="' + url + '">Open workflow</a></p>';
    sendMail_(all, subject, html, false);
    return;
  }

  if (action === 'approved_final') {
    subject = '[' + APP_NAME + '] ' + def.label + ' fully approved: ' + item.title;
    html =
      '<p>The <b>' + def.label + '</b> <b>' + esc_(item.title) + '</b> is <b>fully approved</b>.</p>' +
      '<p><a href="' + item.file_url + '">View document</a> · <a href="' + url + '">Open workflow</a></p>';
    sendMail_(all, subject, html, false);
    return;
  }

  if (action === 'reset') {
    subject = '[' + APP_NAME + '] ' + def.label + ' reset after edit: ' + item.title;
    html =
      '<p>The document was edited. <b>All prior approvals were reset</b> and the process restarted.</p>' +
      '<p><b>' + def.label + ':</b> ' + esc_(item.title) + '<br>' +
      '<b>Edited by:</b> ' + esc_(actorEmail) + '<br>' +
      '<b>Status:</b> ' + esc_(progress) + '</p>' +
      '<p><a href="' + url + '">Open workflow</a></p>';
    sendMail_(all, subject, html, false);
    var urgentTo = emailsForRoles_(roleMap, [item.current_stage_role]);
    sendMail_(
      urgentTo,
      '[URGENT] Re-approve after edit: ' + item.title,
      '<p>Approvals were reset. Please review again.</p><p><a href="' + url + '">Review now</a></p>',
      true
    );
    return;
  }

  // Intermediate approval
  subject = '[' + APP_NAME + '] ' + progress + ' — ' + item.title;
  html =
    '<p>Approval update for <b>' + esc_(item.title) + '</b> (' + def.label + ').</p>' +
    '<p><b>Status:</b> ' + esc_(progress) + '<br>' +
    '<b>Last action by:</b> ' + esc_(actorEmail) + '</p>' +
    '<p><a href="' + url + '">Open workflow</a></p>';
  sendMail_(all, subject, html, false);

  if (item.status === ITEM_STATUS.PENDING && item.current_stage_role) {
    var next = emailsForRoles_(roleMap, [item.current_stage_role]);
    sendMail_(
      next,
      '[URGENT] Your approval needed: ' + item.title,
      '<p><b>Action required.</b></p><p>' + esc_(progress) + '</p><p><a href="' + url + '">Review now</a></p>',
      true
    );
  }
}

function notifyReminder_(item) {
  var roleMap = getRoleMap_();
  var to = emailsForRoles_(roleMap, [item.current_stage_role]);
  var progress = stageProgressText_(item);
  var url = getWebAppUrl_();
  sendMail_(
    to,
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
