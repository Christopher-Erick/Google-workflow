/**
 * Drive folder structure & file helpers
 */

function ensureDriveTree_() {
  var props = getScriptProps_();
  var rootId = props.getProperty(PROP.ROOT_FOLDER_ID);
  var root;
  if (rootId) {
    try {
      root = DriveApp.getFolderById(rootId);
      if (root.isTrashed()) root = null;
    } catch (e) {
      root = null;
    }
  }
  if (!root) {
    if (rootId) props.deleteProperty(PROP.ROOT_FOLDER_ID);
    // Prefer agreed name; fall back to older singular name if already present
    root = findFolderByName_(DriveApp.getRootFolder(), ROOT_FOLDER_NAME);
    if (!root) {
      root = findFolderByName_(DriveApp.getRootFolder(), 'Nazarene for she Document');
    }
    if (!root) {
      root = DriveApp.getRootFolder().createFolder(ROOT_FOLDER_NAME);
    }
    props.setProperty(PROP.ROOT_FOLDER_ID, root.getId());
  }

  // Required structure for every document type:
  // Type / Pending | Approved | Declined
  ensureTypeTree_(root, 'Requisition');
  ensureTypeTree_(root, 'Minutes');
  ensureTypeTree_(root, 'Proof of Payment');

  // Do NOT share with roster here — sharing every page load is very slow.
  // Sharing runs from Setup (Create / Save roles).

  return root;
}

function ensureTypeTree_(root, typeName) {
  var typeFolder = findOrCreateFolder_(root, typeName);
  findOrCreateFolder_(typeFolder, 'Pending');
  findOrCreateFolder_(typeFolder, 'Approved');
  findOrCreateFolder_(typeFolder, 'Declined');
  return typeFolder;
}

function findFolderByName_(parent, name) {
  var it = parent.getFoldersByName(name);
  if (it.hasNext()) return it.next();
  return null;
}

function findOrCreateFolder_(parent, name) {
  var existing = findFolderByName_(parent, name);
  if (existing) return existing;
  return parent.createFolder(name);
}

function getFolderByPath_(pathParts) {
  var root = ensureDriveTree_();
  var current = root;
  for (var i = 0; i < pathParts.length; i++) {
    current = findOrCreateFolder_(current, pathParts[i]);
  }
  return current;
}

/**
 * Preferred naming: 2026-08-12_Requisition_Catering_v1.pdf
 */
function buildFileName_(typeKey, title, version, originalName) {
  var def = getDocType_(typeKey);
  var date = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
  var safeTitle = String(title || 'Document')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 60) || 'Document';
  var label = def.label.replace(/\s+/g, '_');
  var ext = guessExtension_(originalName);
  var ver = 'v' + (version || 1);
  return date + '_' + label + '_' + safeTitle + '_' + ver + (ext ? '.' + ext : '');
}

function guessExtension_(name) {
  if (!name || name.indexOf('.') < 0) return '';
  return name.split('.').pop().toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 8);
}

function saveUploadedFile_(typeKey, title, version, blob, originalName, mimeType) {
  var def = getDocType_(typeKey);
  var folder = getFolderByPath_(def.folderPending);
  var fileName = buildFileName_(typeKey, title, version, originalName || blob.getName());
  if (mimeType) blob.setContentType(mimeType);
  blob.setName(fileName);
  var file = folder.createFile(blob);
  shareFileWithRoster_(file);
  return {
    fileId: file.getId(),
    fileUrl: file.getUrl(),
    fileName: file.getName(),
    mimeType: file.getMimeType(),
    folderId: folder.getId()
  };
}

function moveFileToPath_(fileId, pathParts) {
  var file = DriveApp.getFileById(fileId);
  var dest = getFolderByPath_(pathParts);
  var parents = file.getParents();
  while (parents.hasNext()) {
    parents.next().removeFile(file);
  }
  dest.addFile(file);
  shareFileWithRoster_(file);
  return dest.getId();
}

function attachDeclineNote_(fileId, declinedBy, note, itemTitle) {
  var file = DriveApp.getFileById(fileId);
  var parents = file.getParents();
  var parent = parents.hasNext() ? parents.next() : ensureDriveTree_();
  var stamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd_HHmm');
  var noteName = 'DECLINE_NOTE_' + stamp + '_' + String(itemTitle || 'item').replace(/[^a-zA-Z0-9]+/g, '_').slice(0, 40) + '.txt';
  var body =
    'DECLINED\n' +
    '========\n' +
    'Document: ' + (itemTitle || '') + '\n' +
    'File: ' + file.getName() + '\n' +
    'Declined by: ' + (declinedBy || '') + '\n' +
    'When: ' + nowIso_() + '\n\n' +
    'Reason:\n' + (note || '') + '\n';
  var noteFile = parent.createFile(noteName, body, MimeType.PLAIN_TEXT);
  shareFileWithRoster_(noteFile);
  try {
    file.setDescription(
      'DECLINED by ' + declinedBy + ' on ' + nowIso_() + '\n\n' + note
    );
  } catch (e) {
    // ignore
  }
}

function replaceFileContent_(item, blob, originalName, mimeType) {
  try {
    DriveApp.getFileById(item.file_id).setTrashed(true);
  } catch (e) {
    // keep going
  }
  var version = Number(item.version || 1) + 1;
  return saveUploadedFile_(
    item.type,
    item.title,
    version,
    blob,
    originalName,
    mimeType
  );
}

function listRosterEmailsForSharing_() {
  var set = {};
  try {
    var roleMap = getRoleMap_();
    OFFICER_ROLES.forEach(function (role) {
      if (roleMap[role] && roleMap[role].email) set[roleMap[role].email] = true;
    });
    listMembers_().forEach(function (m) {
      if (m.email) set[m.email] = true;
    });
  } catch (e) {
    // DB may not be ready during very first create
  }
  return Object.keys(set);
}

/**
 * Keep Drive viewer access aligned with the current officer/member roster.
 * Called whenever Admin saves Setup — adds new people, removes former ones.
 */
function syncRosterDriveAccess_() {
  var root = ensureDriveTree_();
  var wanted = {};
  listRosterEmailsForSharing_().forEach(function (email) {
    wanted[String(email).toLowerCase()] = true;
  });
  var owner = '';
  try { owner = getScriptOwnerEmail_(); } catch (eO) {}
  if (owner) wanted[owner] = true;

  var wantedList = Object.keys(wanted);
  var added = 0;

  function shareOne_(folder) {
    if (!folder) return;
    wantedList.forEach(function (email) {
      try {
        folder.addViewer(email);
        added++;
      } catch (e) {
        // already has access / invalid / cannot share
      }
    });
  }

  shareOne_(root);
  ['Requisition', 'Minutes', 'Proof of Payment'].forEach(function (typeName) {
    try {
      var typeFolder = findOrCreateFolder_(root, typeName);
      shareOne_(typeFolder);
      ['Pending', 'Approved', 'Declined'].forEach(function (statusName) {
        shareOne_(findOrCreateFolder_(typeFolder, statusName));
      });
    } catch (eType) {}
  });

  var removed = 0;
  try {
    var viewers = root.getViewers();
    for (var i = 0; i < viewers.length; i++) {
      var ve = String(viewers[i].getEmail() || '').trim().toLowerCase();
      if (!ve || wanted[ve]) continue;
      try {
        root.removeViewer(viewers[i]);
        removed++;
      } catch (eRem) {}
    }
  } catch (eView) {}

  return {
    rosterCount: wantedList.length,
    removedViewers: removed
  };
}

function shareFolderWithRoster_(folder) {
  if (!folder) return;
  var emails = listRosterEmailsForSharing_();
  emails.forEach(function (email) {
    try {
      folder.addViewer(email);
    } catch (e) {
      // may already have access or invalid address
    }
  });
}

function shareFileWithRoster_(file) {
  if (!file) return;
  var emails = listRosterEmailsForSharing_();
  emails.forEach(function (email) {
    try {
      file.addViewer(email);
    } catch (e) {
      // ignore
    }
  });
}

function trashWorkflowFile_(fileId) {
  if (!fileId) return;
  try {
    DriveApp.getFileById(fileId).setTrashed(true);
  } catch (e) {
    // ignore
  }
}
