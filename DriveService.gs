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
    } catch (e) {
      root = null;
    }
  }
  if (!root) {
    root = findOrCreateFolder_(DriveApp.getRootFolder(), ROOT_FOLDER_NAME);
    props.setProperty(PROP.ROOT_FOLDER_ID, root.getId());
  }

  var requisition = findOrCreateFolder_(root, 'Requisition');
  findOrCreateFolder_(requisition, 'Approved');
  findOrCreateFolder_(requisition, 'Declined');
  findOrCreateFolder_(requisition, 'Pending');

  var minutes = findOrCreateFolder_(root, 'Minutes');
  findOrCreateFolder_(minutes, 'Pending');
  findOrCreateFolder_(minutes, 'Declined');

  var proof = findOrCreateFolder_(root, 'Proof of Payment');
  findOrCreateFolder_(proof, 'Pending');
  findOrCreateFolder_(proof, 'Declined');

  return root;
}

function findOrCreateFolder_(parent, name) {
  var it = parent.getFoldersByName(name);
  if (it.hasNext()) return it.next();
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
  parent.createFile(noteName, body, MimeType.PLAIN_TEXT);
  // Also set Drive description on main file
  try {
    file.setDescription(
      'DECLINED by ' + declinedBy + ' on ' + nowIso_() + '\n\n' + note
    );
  } catch (e) {
    // ignore
  }
}

function replaceFileContent_(item, blob, originalName, mimeType) {
  var def = getDocType_(item.type);
  // Remove old file from pending; create new version in pending
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
