/**
 * Nazarene for SHE — shared config & workflow definitions
 */

var APP_NAME = 'Nazarene for she Organisation';
var ORG_NAME = 'Nazarene for she Organisation';
var ORG_SLOGAN_DEFAULT = 'She empowered, Community inspired.';
var ROOT_FOLDER_NAME = 'Nazarene for she Documents';
var DB_SHEET_NAME = 'NAZ Workflow DB';

var PROP = {
  SETUP_DONE: 'SETUP_DONE',
  ROOT_FOLDER_ID: 'ROOT_FOLDER_ID',
  DB_SPREADSHEET_ID: 'DB_SPREADSHEET_ID',
  WEB_APP_URL: 'WEB_APP_URL',
  ORG_SLOGAN: 'ORG_SLOGAN',
  LOGO_FILE_ID: 'LOGO_FILE_ID',
  WHATSAPP_MODE: 'WHATSAPP_MODE',
  WHATSAPP_WEBHOOK_URL: 'WHATSAPP_WEBHOOK_URL',
  LAST_MAIL_STATUS: 'LAST_MAIL_STATUS'
};

/** Officer roles only — members live on the Members sheet */
var OFFICER_ROLES = [
  'admin',
  'chair',
  'vice_chair',
  'secretary',
  'assistant_secretary',
  'patron',
  'treasurer'
];

var ROLE_LABELS = {
  admin: 'Admin',
  chair: 'Chair',
  vice_chair: 'Vice Chair',
  secretary: 'Secretary',
  assistant_secretary: 'Assistant Secretary',
  patron: 'Patron',
  treasurer: 'Treasurer'
};

/** Document types and approval chains (role keys in order) */
var DOC_TYPES = {
  requisition: {
    key: 'requisition',
    label: 'Requisition',
    stages: ['chair', 'patron', 'treasurer'],
    submitRoles: ['chair', 'secretary'],
    editRoles: ['secretary', 'patron'],
    autoApproveFirstIfSubmitterRole: 'chair',
    folderApproved: ['Requisition', 'Approved'],
    folderDeclined: ['Requisition', 'Declined'],
    folderPending: ['Requisition', 'Pending']
  },
  minutes: {
    key: 'minutes',
    label: 'Minutes',
    stages: ['secretary', 'assistant_secretary', 'vice_chair'],
    submitRoles: ['secretary'],
    editRoles: ['secretary'],
    autoApproveFirstIfSubmitterRole: 'secretary',
    folderApproved: ['Minutes', 'Approved'],
    folderDeclined: ['Minutes', 'Declined'],
    folderPending: ['Minutes', 'Pending']
  },
  proof_of_payment: {
    key: 'proof_of_payment',
    label: 'Proof of Payment',
    stages: ['treasurer', 'chair', 'patron'],
    submitRoles: ['treasurer'],
    editRoles: ['secretary'],
    autoApproveFirstIfSubmitterRole: 'treasurer',
    folderApproved: ['Proof of Payment', 'Approved'],
    folderDeclined: ['Proof of Payment', 'Declined'],
    folderPending: ['Proof of Payment', 'Pending']
  }
};

var ITEM_STATUS = {
  PENDING: 'pending',
  APPROVED: 'approved',
  DECLINED: 'declined',
  ARCHIVED: 'archived'
};

var REMINDER_DAYS = 7;

var ALLOWED_MIME = {
  'application/pdf': 'pdf',
  'application/vnd.google-apps.document': 'gdoc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/msword': 'doc',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'application/vnd.ms-excel': 'xls',
  'application/vnd.google-apps.spreadsheet': 'gsheet',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/gif': 'gif',
  'image/webp': 'webp'
};

function getScriptProps_() {
  return PropertiesService.getScriptProperties();
}

function getDocType_(typeKey) {
  var t = DOC_TYPES[typeKey];
  if (!t) throw new Error('Unknown document type: ' + typeKey);
  return t;
}
