/**
 * Email + WhatsApp notifications
 */

/**
 * Send notification mail. Uses MailApp (same path as OTP login codes).
 * Tries one BCC message first (fast on submit); falls back per-recipient
 * so one bad address cannot block everyone.
 */
function sendMail_(toList, subject, htmlBody, urgent) {
  var recipients = uniqueEmails_(toList).filter(function (e) {
    return e.indexOf('@') > 0;
  });
  if (!recipients.length) {
    console.error('sendMail_: no recipients for "' + subject + '"');
    try {
      audit_('', 'mail_skipped_no_recipients', '', { subject: String(subject || '') });
    } catch (eA) {}
    return { sent: 0, failed: [] };
  }

  var fullSubject = String(subject || '');
  if (urgent && fullSubject.indexOf('[URGENT]') !== 0) {
    fullSubject = '[URGENT] ' + fullSubject;
  }

  var sent = 0;
  var failed = [];

  // Fast path: one message (to first, BCC rest) — needed so submit does not time out
  if (recipients.length > 1) {
    try {
      MailApp.sendEmail({
        to: recipients[0],
        bcc: recipients.slice(1).join(','),
        subject: fullSubject,
        htmlBody: htmlBody,
        name: APP_NAME
      });
      recordMailStatus_(fullSubject, recipients.length, recipients.length, []);
      return { sent: recipients.length, failed: [] };
    } catch (eBcc) {
      console.error('sendMail_ BCC failed, falling back: ' + (eBcc.message || eBcc));
    }
  }

  recipients.forEach(function (to) {
    try {
      MailApp.sendEmail({
        to: to,
        subject: fullSubject,
        htmlBody: htmlBody,
        name: APP_NAME
      });
      sent++;
    } catch (eMail) {
      var msg = String((eMail && eMail.message) || eMail);
      failed.push(to + ': ' + msg);
      console.error('sendMail_ failed for ' + to + ': ' + msg);
      try {
        GmailApp.sendEmail(to, fullSubject, stripHtml_(htmlBody), {
          htmlBody: htmlBody,
          name: APP_NAME
        });
        sent++;
        failed.pop();
      } catch (eGmail) {
        failed[failed.length - 1] =
          to + ': ' + msg + ' / gmail: ' + String((eGmail && eGmail.message) || eGmail);
      }
    }
  });

  recordMailStatus_(fullSubject, recipients.length, sent, failed);

  if (failed.length) {
    try {
      audit_('', 'mail_partial_failure', '', {
        subject: fullSubject,
        sent: sent,
        failed: failed.slice(0, 12)
      });
    } catch (eAud) {}
  }

  return { sent: sent, failed: failed };
}

function recordMailStatus_(subject, recipientCount, sent, failed) {
  try {
    getScriptProps_().setProperty(
      PROP.LAST_MAIL_STATUS,
      JSON.stringify({
        at: new Date().toISOString(),
        subject: subject,
        recipientCount: recipientCount,
        sent: sent,
        failed: (failed || []).slice(0, 8)
      })
    );
  } catch (eProp) {}
}

function getLastMailStatus_() {
  try {
    var raw = getScriptProps_().getProperty(PROP.LAST_MAIL_STATUS);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (e) {
    return null;
  }
}

/**
 * Admin/self-check: send one test message to the signed-in roster email.
 */
function sendTestNotificationMail_(toEmail) {
  var ctx = requireKnownUser_();
  var to = String(toEmail || ctx.email || '').trim().toLowerCase();
  if (!to || to.indexOf('@') < 0) throw new Error('Enter a valid email to test.');
  var result = sendMail_(
    [to],
    '[' + APP_NAME + '] Test notification',
    '<p>This is a test email from <b>' + esc_(APP_NAME) + '</b>.</p>' +
      '<p>If you received this, stage approval emails can send from the group Gmail that owns the script.</p>' +
      '<p>Requested by: ' + esc_(ctx.email) + '</p>',
    false
  );
  if (!result.sent) {
    throw new Error(
      'Test email failed to send. ' +
      (result.failed && result.failed.length ? result.failed.join('; ') : 'Check group Gmail authorization / daily quota.')
    );
  }
  return { ok: true, to: to, sent: result.sent, lastMailStatus: getLastMailStatus_() };
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

/** Non-officer members from the Members sheet (Setup → members list). */
function memberNotificationEmails_() {
  return listMembers_().map(function (m) {
    return m.email;
  }).filter(function (e) {
    return !!e;
  });
}

function memberNotificationPhones_() {
  return listMembers_().map(function (m) {
    return normalizePhone_(m.whatsapp);
  }).filter(function (p) {
    return !!p;
  });
}

/**
 * Everyone who should get status FYI: all officers + members.
 */
function fyiRecipients_(roleMap) {
  return allNotificationEmails_(roleMap || getRoleMap_());
}

function fyiPhones_(roleMap) {
  return allNotificationPhones_(roleMap || getRoleMap_());
}

/**
 * On submit and after each stage advance while still pending:
 *  1) FYI to officers + members — submitted / waiting on next approver
 *  2) Urgent to the current-stage approver only
 * Continues until fully approved (then one final FYI, no urgent).
 */
function notifySubmitted_(item, ctx) {
  var roleMap = ctx.roleMap || getRoleMap_();
  var def = getDocType_(item.type);
  var progress = stageProgressText_(item);
  var url = getWebAppUrl_();
  var submitterName = displayNameForEmail_(item.submitter_email, roleMap);
  var waitingName = item.current_stage_role ? displayNameForRole_(item.current_stage_role, roleMap) : '';

  if (item.status === ITEM_STATUS.APPROVED) {
    notifyChannels_(
      fyiRecipients_(roleMap),
      fyiPhones_(roleMap),
      '[' + APP_NAME + '] ' + def.label + ' fully approved: ' + item.title,
      '<p>The <b>' + def.label + '</b> <b>' + esc_(item.title) + '</b> was <b>fully approved</b> on submit.</p>' +
        '<p><b>Submitted by:</b> ' + esc_(submitterName) + '</p>' +
        '<p><a href="' + url + '">Open workflow</a></p>',
      false
    );
    return;
  }

  var fyiHtml =
    '<p>A new <b>' + def.label + '</b> has been <b>submitted</b> and is waiting for approval.</p>' +
    '<p><b>Title:</b> ' + esc_(item.title) + '<br>' +
    '<b>Submitted by:</b> ' + esc_(submitterName) + ' &lt;' + esc_(item.submitter_email) + '&gt;<br>' +
    '<b>Status:</b> ' + esc_(progress) +
    (waitingName ? '<br><b>Waiting on:</b> ' + esc_(waitingName) : '') +
    '</p>' +
    '<p><a href="' + url + '">Open workflow</a></p>';
  notifyChannels_(
    fyiRecipients_(roleMap),
    fyiPhones_(roleMap),
    '[' + APP_NAME + '] New ' + def.label + ' submitted — waiting approval: ' + item.title,
    fyiHtml,
    false
  );

  if (item.status === ITEM_STATUS.PENDING && item.current_stage_role) {
    notifyChannels_(
      emailsForRoles_(roleMap, [item.current_stage_role]),
      phonesForRoles_(roleMap, [item.current_stage_role]),
      'Approve ' + def.label + ': ' + item.title,
      '<p><b>Action required' + (waitingName ? ' (' + esc_(waitingName) + ')' : '') + ':</b> Please review and approve or decline.</p>' +
        '<p><b>' + def.label + ':</b> ' + esc_(item.title) + '<br>' +
        '<b>Submitted by:</b> ' + esc_(submitterName) + '<br>' +
        '<b>Status:</b> ' + esc_(progress) + '</p>' +
        '<p><a href="' + url + '">Review now</a></p>',
      true
    );
  }
}

function notifyStageUpdate_(item, actorEmail, action) {
  var roleMap = getRoleMap_();
  var def = getDocType_(item.type);
  var progress = stageProgressText_(item);
  var url = getWebAppUrl_();
  var actorName = displayNameForEmail_(actorEmail, roleMap);
  var waitingName = item.current_stage_role ? displayNameForRole_(item.current_stage_role, roleMap) : '';
  var fyi = fyiRecipients_(roleMap);
  var fyiPhone = fyiPhones_(roleMap);

  if (action === 'declined') {
    notifyChannels_(
      fyi,
      fyiPhone,
      '[' + APP_NAME + '] ' + def.label + ' declined: ' + item.title,
      '<p>The <b>' + def.label + '</b> <b>' + esc_(item.title) + '</b> was <b>declined</b>.</p>' +
        '<p><b>By:</b> ' + esc_(actorName) + ' &lt;' + esc_(actorEmail) + '&gt;<br>' +
        '<b>Reason:</b> ' + esc_(item.decline_note || '') + '</p>' +
        '<p>The process has been terminated. The submitter may reopen or submit a new item.</p>' +
        '<p><a href="' + url + '">Open workflow</a></p>',
      false
    );
    return;
  }

  if (action === 'approved_final') {
    notifyChannels_(
      fyi,
      fyiPhone,
      '[' + APP_NAME + '] ' + def.label + ' fully approved: ' + item.title,
      '<p>The <b>' + def.label + '</b> <b>' + esc_(item.title) + '</b> is <b>fully approved</b>.</p>' +
        '<p><b>Last recorded approver:</b> ' + esc_(actorName) + '</p>' +
        '<p><a href="' + item.file_url + '">View document</a> · <a href="' + url + '">Open workflow</a></p>',
      false
    );
    return;
  }

  if (action === 'reset') {
    notifyChannels_(
      fyi,
      fyiPhone,
      '[' + APP_NAME + '] ' + def.label + ' reset after edit: ' + item.title,
      '<p>The document was edited. <b>All prior approvals were reset</b> and the process restarted.</p>' +
        '<p><b>' + def.label + ':</b> ' + esc_(item.title) + '<br>' +
        '<b>Edited by:</b> ' + esc_(actorName) + ' &lt;' + esc_(actorEmail) + '&gt;<br>' +
        '<b>Status:</b> ' + esc_(progress) + '</p>' +
        '<p><a href="' + url + '">Open workflow</a></p>',
      false
    );
    if (item.status === ITEM_STATUS.PENDING && item.current_stage_role) {
      notifyChannels_(
        emailsForRoles_(roleMap, [item.current_stage_role]),
        phonesForRoles_(roleMap, [item.current_stage_role]),
        'Re-approve after edit: ' + item.title,
        '<p>Approvals were reset. Please review again.</p><p><a href="' + url + '">Review now</a></p>',
        true
      );
    }
    return;
  }

  // Mid-stage approval: FYI everyone (still waiting) + urgent to next approver
  notifyChannels_(
    fyi,
    fyiPhone,
    '[' + APP_NAME + '] ' + progress + ' — ' + item.title,
    '<p>Approval update for <b>' + esc_(item.title) + '</b> (' + def.label + ').</p>' +
      '<p><b>Status:</b> ' + esc_(progress) + '<br>' +
      '<b>Recorded action by:</b> ' + esc_(actorName) + ' &lt;' + esc_(actorEmail) + '&gt;' +
      (waitingName ? '<br><b>Now waiting on:</b> ' + esc_(waitingName) : '') +
      '</p>' +
      '<p><a href="' + url + '">Open workflow</a></p>',
    false
  );

  if (item.status === ITEM_STATUS.PENDING && item.current_stage_role) {
    notifyChannels_(
      emailsForRoles_(roleMap, [item.current_stage_role]),
      phonesForRoles_(roleMap, [item.current_stage_role]),
      'Your approval needed: ' + item.title,
      '<p><b>Action required' + (waitingName ? ' (' + esc_(waitingName) + ')' : '') + '.</b></p>' +
        '<p>' + esc_(progress) + '</p>' +
        '<p><a href="' + url + '">Review now</a></p>',
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
