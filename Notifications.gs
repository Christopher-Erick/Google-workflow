/**
 * Email + WhatsApp notifications
 */

/**
 * Remaining MailApp quota (consumer Gmail ~100/day).  -1 if unknown.
 */
function getMailQuotaRemaining_() {
  try {
    return MailApp.getRemainingDailyQuota();
  } catch (e) {
    return -1;
  }
}

/**
 * Core send — same MailApp path as OTP login codes.
 * Urgent: one message per recipient (reliable).
 * FYI: one message with BCC (saves quota); falls back per-recipient.
 */
function sendMail_(toList, subject, htmlBody, urgent) {
  var recipients = uniqueEmails_(toList).filter(function (e) {
    return e.indexOf('@') > 0 && e.indexOf(' ') < 0;
  });
  var fullSubject = String(subject || '');
  if (urgent && fullSubject.indexOf('[URGENT]') !== 0) {
    fullSubject = '[URGENT] ' + fullSubject;
  }
  var plain = stripHtml_(htmlBody);
  var quota = getMailQuotaRemaining_();

  if (!recipients.length) {
    recordMailStatus_(fullSubject, 0, 0, ['no recipients'], quota);
    try {
      audit_('', 'mail_skipped_no_recipients', '', { subject: fullSubject });
    } catch (eA) {}
    return { sent: 0, failed: ['no recipients'], quota: quota };
  }

  if (quota === 0) {
    var qFail = ['MailApp daily quota is 0 — group Gmail cannot send more mail today'];
    recordMailStatus_(fullSubject, recipients.length, 0, qFail, quota);
    try {
      audit_('', 'mail_quota_exhausted', '', { subject: fullSubject });
    } catch (eQ) {}
    return { sent: 0, failed: qFail, quota: quota };
  }

  var sent = 0;
  var failed = [];

  function sendOne_(to) {
    // Match OTP login exactly first (most reliable)
    try {
      MailApp.sendEmail({
        to: to,
        subject: fullSubject,
        body: plain,
        htmlBody: htmlBody,
        name: APP_NAME
      });
      return true;
    } catch (e1) {
      try {
        GmailApp.sendEmail(to, fullSubject, plain, {
          htmlBody: htmlBody,
          name: APP_NAME
        });
        return true;
      } catch (e2) {
        failed.push(to + ': ' + String((e1 && e1.message) || e1) + ' / ' + String((e2 && e2.message) || e2));
        return false;
      }
    }
  }

  if (urgent || recipients.length === 1) {
    recipients.forEach(function (to) {
      if (sendOne_(to)) sent++;
    });
  } else {
    // FYI: one BCC send to save quota
    var primary = recipients[0];
    var bccList = recipients.slice(1);
    var bccOk = false;
    try {
      MailApp.sendEmail({
        to: primary,
        bcc: bccList.join(','),
        subject: fullSubject,
        body: plain,
        htmlBody: htmlBody,
        name: APP_NAME
      });
      sent = recipients.length;
      bccOk = true;
    } catch (eBcc) {
      try {
        GmailApp.sendEmail(primary, fullSubject, plain, {
          htmlBody: htmlBody,
          name: APP_NAME,
          bcc: bccList.join(',')
        });
        sent = recipients.length;
        bccOk = true;
      } catch (eBcc2) {
        console.error('BCC mail failed, sending individually: ' + (eBcc2.message || eBcc2));
      }
    }
    if (!bccOk) {
      // Cap individual FYI sends so submit does not hang / exhaust quota
      var cap = Math.min(recipients.length, 25);
      for (var i = 0; i < cap; i++) {
        if (sendOne_(recipients[i])) sent++;
      }
      if (recipients.length > cap) {
        failed.push('FYI truncated: ' + (recipients.length - cap) + ' not sent (quota/speed cap)');
      }
    }
  }

  recordMailStatus_(fullSubject, recipients.length, sent, failed, getMailQuotaRemaining_());
  if (failed.length) {
    try {
      audit_('', 'mail_partial_failure', '', {
        subject: fullSubject,
        sent: sent,
        failed: failed.slice(0, 12)
      });
    } catch (eAud) {}
  }
  return { sent: sent, failed: failed, quota: getMailQuotaRemaining_() };
}

function recordMailStatus_(subject, recipientCount, sent, failed, quota) {
  try {
    getScriptProps_().setProperty(
      PROP.LAST_MAIL_STATUS,
      JSON.stringify({
        at: new Date().toISOString(),
        subject: subject,
        recipientCount: recipientCount,
        sent: sent,
        failed: (failed || []).slice(0, 8),
        quota: quota
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

function summarizeMailResults_(parts) {
  var sent = 0;
  var failed = [];
  (parts || []).forEach(function (p) {
    if (!p) return;
    sent += Number(p.sent || 0);
    (p.failed || []).forEach(function (f) { failed.push(f); });
  });
  var quota = getMailQuotaRemaining_();
  var msg =
    'Mail: ' + sent + ' delivered' +
    (failed.length ? ('; ' + failed.length + ' failed') : '') +
    (quota >= 0 ? ('; quota left today ' + quota) : '');
  if (failed.length) msg += ' — ' + failed.slice(0, 3).join('; ');
  return { sent: sent, failed: failed, quota: quota, message: msg };
}

/**
 * Admin/self-check: send one test message to the signed-in roster email.
 */
function sendTestNotificationMail_(toEmail) {
  var ctx = requireKnownUser_();
  var to = String(toEmail || ctx.email || '').trim().toLowerCase();
  if (!to || to.indexOf('@') < 0) throw new Error('Enter a valid email to test.');
  var quota = getMailQuotaRemaining_();
  if (quota === 0) {
    throw new Error(
      'Group Gmail mail quota is used up for today (0 remaining). Wait until tomorrow or use a Google Workspace account with higher limits.'
    );
  }
  var result = sendMail_(
    [to],
    '[' + APP_NAME + '] Test notification',
    '<p>This is a test email from <b>' + esc_(APP_NAME) + '</b>.</p>' +
      '<p>If you received this, notification mail works from the account that owns the script.</p>' +
      '<p>Requested by: ' + esc_(ctx.email) + '</p>' +
      '<p>Quota remaining after send: check Setup → last mail status.</p>',
    false
  );
  if (!result.sent) {
    throw new Error(
      'Test email failed. ' +
      (result.failed && result.failed.length ? result.failed.join('; ') : 'Unknown error') +
      (quota >= 0 ? (' Quota before send: ' + quota) : '')
    );
  }
  return {
    ok: true,
    to: to,
    sent: result.sent,
    quota: getMailQuotaRemaining_(),
    lastMailStatus: getLastMailStatus_()
  };
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
 */
function notifyChannels_(emails, phones, subject, htmlBody, urgent) {
  var mailResult = sendMail_(emails, subject, htmlBody, urgent);
  var text = (urgent ? '[URGENT] ' : '') + subject + '\n\n' + stripHtml_(htmlBody);
  sendWhatsAppBulk_(phones, text);
  return mailResult;
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

function fyiRecipients_(roleMap) {
  return allNotificationEmails_(roleMap || getRoleMap_());
}

function fyiPhones_(roleMap) {
  return allNotificationPhones_(roleMap || getRoleMap_());
}

/**
 * On submit:
 *  1) FYI to officers + members — submitted, waiting approval
 *  2) Urgent to current-stage approver
 * Same pattern continues on each stage until fully approved.
 */
function notifySubmitted_(item, ctx) {
  var roleMap = ctx.roleMap || getRoleMap_();
  var def = getDocType_(item.type);
  var progress = stageProgressText_(item);
  var url = getWebAppUrl_();
  var submitterName = displayNameForEmail_(item.submitter_email, roleMap);
  var waitingName = item.current_stage_role ? displayNameForRole_(item.current_stage_role, roleMap) : '';
  var results = [];

  if (item.status === ITEM_STATUS.APPROVED) {
    results.push(notifyChannels_(
      fyiRecipients_(roleMap),
      fyiPhones_(roleMap),
      '[' + APP_NAME + '] ' + def.label + ' fully approved: ' + item.title,
      '<p>The <b>' + def.label + '</b> <b>' + esc_(item.title) + '</b> was <b>fully approved</b> on submit.</p>' +
        '<p><b>Submitted by:</b> ' + esc_(submitterName) + '</p>' +
        '<p><a href="' + url + '">Open workflow</a></p>',
      false
    ));
    return summarizeMailResults_(results);
  }

  results.push(notifyChannels_(
    fyiRecipients_(roleMap),
    fyiPhones_(roleMap),
    '[' + APP_NAME + '] New ' + def.label + ' submitted — waiting approval: ' + item.title,
    '<p>A new <b>' + def.label + '</b> has been <b>submitted</b> and is waiting for approval.</p>' +
      '<p><b>Title:</b> ' + esc_(item.title) + '<br>' +
      '<b>Submitted by:</b> ' + esc_(submitterName) + ' &lt;' + esc_(item.submitter_email) + '&gt;<br>' +
      '<b>Status:</b> ' + esc_(progress) +
      (waitingName ? '<br><b>Waiting on:</b> ' + esc_(waitingName) : '') +
      '</p>' +
      '<p><a href="' + url + '">Open workflow</a></p>',
    false
  ));

  if (item.status === ITEM_STATUS.PENDING && item.current_stage_role) {
    var urgentTo = emailsForRoles_(roleMap, [item.current_stage_role]);
    if (!urgentTo.length) {
      results.push({ sent: 0, failed: ['No email set in Setup for role: ' + item.current_stage_role] });
    } else {
      results.push(notifyChannels_(
        urgentTo,
        phonesForRoles_(roleMap, [item.current_stage_role]),
        'Approve ' + def.label + ': ' + item.title,
        '<p><b>Action required' + (waitingName ? ' (' + esc_(waitingName) + ')' : '') + ':</b> Please review and approve or decline.</p>' +
          '<p><b>' + def.label + ':</b> ' + esc_(item.title) + '<br>' +
          '<b>Submitted by:</b> ' + esc_(submitterName) + '<br>' +
          '<b>Status:</b> ' + esc_(progress) + '</p>' +
          '<p><a href="' + url + '">Review now</a></p>',
        true
      ));
    }
  }

  return summarizeMailResults_(results);
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
  var results = [];

  if (action === 'declined') {
    results.push(notifyChannels_(
      fyi,
      fyiPhone,
      '[' + APP_NAME + '] ' + def.label + ' declined: ' + item.title,
      '<p>The <b>' + def.label + '</b> <b>' + esc_(item.title) + '</b> was <b>declined</b>.</p>' +
        '<p><b>By:</b> ' + esc_(actorName) + ' &lt;' + esc_(actorEmail) + '&gt;<br>' +
        '<b>Reason:</b> ' + esc_(item.decline_note || '') + '</p>' +
        '<p>The process has been terminated. The submitter may reopen or submit a new item.</p>' +
        '<p><a href="' + url + '">Open workflow</a></p>',
      false
    ));
    return summarizeMailResults_(results);
  }

  if (action === 'approved_final') {
    results.push(notifyChannels_(
      fyi,
      fyiPhone,
      '[' + APP_NAME + '] ' + def.label + ' fully approved: ' + item.title,
      '<p>The <b>' + def.label + '</b> <b>' + esc_(item.title) + '</b> is <b>fully approved</b>.</p>' +
        '<p><b>Last recorded approver:</b> ' + esc_(actorName) + '</p>' +
        '<p><a href="' + item.file_url + '">View document</a> · <a href="' + url + '">Open workflow</a></p>',
      false
    ));
    return summarizeMailResults_(results);
  }

  if (action === 'reset') {
    results.push(notifyChannels_(
      fyi,
      fyiPhone,
      '[' + APP_NAME + '] ' + def.label + ' reset after edit: ' + item.title,
      '<p>The document was edited. <b>All prior approvals were reset</b> and the process restarted.</p>' +
        '<p><b>' + def.label + ':</b> ' + esc_(item.title) + '<br>' +
        '<b>Edited by:</b> ' + esc_(actorName) + ' &lt;' + esc_(actorEmail) + '&gt;<br>' +
        '<b>Status:</b> ' + esc_(progress) + '</p>' +
        '<p><a href="' + url + '">Open workflow</a></p>',
      false
    ));
    if (item.status === ITEM_STATUS.PENDING && item.current_stage_role) {
      results.push(notifyChannels_(
        emailsForRoles_(roleMap, [item.current_stage_role]),
        phonesForRoles_(roleMap, [item.current_stage_role]),
        'Re-approve after edit: ' + item.title,
        '<p>Approvals were reset. Please review again.</p><p><a href="' + url + '">Review now</a></p>',
        true
      ));
    }
    return summarizeMailResults_(results);
  }

  // Mid-stage: FYI everyone + urgent to next approver
  results.push(notifyChannels_(
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
  ));

  if (item.status === ITEM_STATUS.PENDING && item.current_stage_role) {
    var urgentTo = emailsForRoles_(roleMap, [item.current_stage_role]);
    if (!urgentTo.length) {
      results.push({ sent: 0, failed: ['No email set in Setup for role: ' + item.current_stage_role] });
    } else {
      results.push(notifyChannels_(
        urgentTo,
        phonesForRoles_(roleMap, [item.current_stage_role]),
        'Your approval needed: ' + item.title,
        '<p><b>Action required' + (waitingName ? ' (' + esc_(waitingName) + ')' : '') + '.</b></p>' +
          '<p>' + esc_(progress) + '</p>' +
          '<p><a href="' + url + '">Review now</a></p>',
        true
      ));
    }
  }

  return summarizeMailResults_(results);
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
