/**
 * Daily reminder job — notify approvers for items idle >= 7 days
 */

function dailyReminderJob() {
  try {
    if (getScriptProps_().getProperty(PROP.SETUP_DONE) !== '1') return;
    ensureDb_({ allowCreate: false });
    var items = listItems_().filter(function (i) {
      return i.status === ITEM_STATUS.PENDING;
    });
    var cutoff = Date.now() - REMINDER_DAYS * 24 * 60 * 60 * 1000;
    items.forEach(function (item) {
      var last = new Date(item.last_action_at || item.updated_at || item.created_at).getTime();
      if (isNaN(last)) return;
      if (last <= cutoff) {
        notifyReminder_(item);
        audit_(item.id, 'reminder_sent', 'system', { days: REMINDER_DAYS });
      }
    });
  } catch (e) {
    console.error('dailyReminderJob failed: ' + e.message);
  }
}
