/**
 * Spreadsheet-backed database
 */

var SHEETS = {
  ROLES: 'Roles',
  MEMBERS: 'Members',
  ITEMS: 'Items',
  APPROVALS: 'Approvals',
  AUDIT: 'Audit',
  SETTINGS: 'Settings'
};

function clearStaleDbId_() {
  var props = getScriptProps_();
  props.deleteProperty(PROP.DB_SPREADSHEET_ID);
  props.setProperty(PROP.SETUP_DONE, '0');
}

/**
 * Open existing DB if the stored file still exists. Never creates.
 * Clears stale IDs when Drive/Sheet was deleted from the trash.
 */
function tryOpenDb_() {
  var props = getScriptProps_();
  var id = props.getProperty(PROP.DB_SPREADSHEET_ID);
  if (!id) return null;
  try {
    var file = DriveApp.getFileById(id);
    if (file.isTrashed()) {
      clearStaleDbId_();
      return null;
    }
    return SpreadsheetApp.openById(id);
  } catch (e) {
    clearStaleDbId_();
    return null;
  }
}

function getDb_() {
  var ss = tryOpenDb_();
  if (!ss) throw new Error('Database not initialized. Open Setup and click Create Drive folders & database.');
  return ss;
}

/**
 * Open DB or create a fresh one. Use only from Setup / save / workflow writes.
 */
function ensureDb_() {
  var props = getScriptProps_();
  var ss = tryOpenDb_();
  if (!ss) {
    ss = SpreadsheetApp.create(DB_SHEET_NAME);
    props.setProperty(PROP.DB_SPREADSHEET_ID, ss.getId());
    props.setProperty(PROP.SETUP_DONE, '0');
  }
  ensureSheet_(ss, SHEETS.ROLES, [
    'role', 'name', 'email', 'whatsapp', 'updated_at'
  ]);
  ensureSheet_(ss, SHEETS.MEMBERS, [
    'name', 'email', 'whatsapp', 'updated_at'
  ]);
  ensureSheet_(ss, SHEETS.ITEMS, [
    'id', 'type', 'title', 'status', 'current_stage_index', 'current_stage_role',
    'submitter_email', 'file_id', 'file_url', 'file_name', 'mime_type',
    'folder_id', 'decline_note', 'declined_by', 'created_at', 'updated_at',
    'last_action_at', 'version', 'reopened_from'
  ]);
  ensureSheet_(ss, SHEETS.APPROVALS, [
    'id', 'item_id', 'stage_role', 'stage_index', 'action', 'actor_email',
    'actor_name', 'note', 'timestamp'
  ]);
  ensureSheet_(ss, SHEETS.AUDIT, [
    'id', 'item_id', 'action', 'actor_email', 'detail', 'timestamp'
  ]);
  ensureSheet_(ss, SHEETS.SETTINGS, ['key', 'value']);
  return ss;
}

function ensureSheet_(ss, name, headers) {
  var sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.setFrozenRows(1);
  } else if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  } else {
    // Add any new columns missing from older DBs
    var existing = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    headers.forEach(function (h) {
      if (existing.indexOf(h) < 0) {
        sheet.insertColumnAfter(sheet.getLastColumn());
        sheet.getRange(1, sheet.getLastColumn()).setValue(h);
        existing.push(h);
      }
    });
  }
  // Remove default Sheet1 if present and empty
  var def = ss.getSheetByName('Sheet1');
  if (def && ss.getSheets().length > 1) {
    ss.deleteSheet(def);
  }
  return sheet;
}

function sheetToObjects_(sheet) {
  var data = sheet.getDataRange().getValues();
  if (data.length < 2) return [];
  var headers = data[0];
  var rows = [];
  for (var i = 1; i < data.length; i++) {
    var obj = {};
    var empty = true;
    for (var c = 0; c < headers.length; c++) {
      obj[headers[c]] = data[i][c];
      if (data[i][c] !== '' && data[i][c] != null) empty = false;
    }
    if (!empty) {
      obj._row = i + 1;
      rows.push(obj);
    }
  }
  return rows;
}

function appendRow_(sheetName, obj) {
  var sheet = getDb_().getSheetByName(sheetName);
  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var row = headers.map(function (h) {
    return obj[h] != null ? obj[h] : '';
  });
  sheet.appendRow(row);
}

function updateRowById_(sheetName, id, patch) {
  var sheet = getDb_().getSheetByName(sheetName);
  var rows = sheetToObjects_(sheet);
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i].id) === String(id)) {
      var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
      var merged = {};
      for (var k in rows[i]) {
        if (k !== '_row') merged[k] = rows[i][k];
      }
      for (var p in patch) merged[p] = patch[p];
      var values = headers.map(function (h) {
        return merged[h] != null ? merged[h] : '';
      });
      sheet.getRange(rows[i]._row, 1, 1, headers.length).setValues([values]);
      return merged;
    }
  }
  throw new Error('Row not found: ' + id);
}

function findById_(sheetName, id) {
  var rows = sheetToObjects_(getDb_().getSheetByName(sheetName));
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i].id) === String(id)) return rows[i];
  }
  return null;
}

function listItems_() {
  return sheetToObjects_(getDb_().getSheetByName(SHEETS.ITEMS));
}

function listApprovalsForItem_(itemId) {
  return sheetToObjects_(getDb_().getSheetByName(SHEETS.APPROVALS)).filter(function (a) {
    return String(a.item_id) === String(itemId);
  });
}

function newId_(prefix) {
  return prefix + '_' + Utilities.getUuid().replace(/-/g, '').slice(0, 12);
}

function nowIso_() {
  return new Date().toISOString();
}

function getSetting_(key, defaultValue) {
  var rows = sheetToObjects_(getDb_().getSheetByName(SHEETS.SETTINGS));
  for (var i = 0; i < rows.length; i++) {
    if (rows[i].key === key) return rows[i].value;
  }
  return defaultValue;
}

function setSetting_(key, value) {
  var sheet = getDb_().getSheetByName(SHEETS.SETTINGS);
  var rows = sheetToObjects_(sheet);
  for (var i = 0; i < rows.length; i++) {
    if (rows[i].key === key) {
      sheet.getRange(rows[i]._row, 2).setValue(value);
      return;
    }
  }
  sheet.appendRow([key, value]);
}

function audit_(itemId, action, actorEmail, detail) {
  appendRow_(SHEETS.AUDIT, {
    id: newId_('aud'),
    item_id: itemId || '',
    action: action,
    actor_email: actorEmail || '',
    detail: typeof detail === 'string' ? detail : JSON.stringify(detail || {}),
    timestamp: nowIso_()
  });
}
