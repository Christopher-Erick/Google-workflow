/**
 * Submit / approve / decline / edit-reset / reopen / admin actions
 */

function computeInitialStage_(typeKey, submitterEmail, roleMap) {
  var def = getDocType_(typeKey);
  var stages = def.stages;
  var autoRole = def.autoApproveFirstIfSubmitterRole;
  var submitterRoleMatch = false;

  if (autoRole) {
    var roleEmail = roleMap[autoRole] && roleMap[autoRole].email;
    if (roleEmail && roleEmail === String(submitterEmail).toLowerCase()) {
      submitterRoleMatch = true;
    }
    // Also: chair submitting requisition — submitRoles includes chair
    if (typeKey === 'requisition' && roleMap.chair && roleMap.chair.email === submitterEmail) {
      submitterRoleMatch = true;
    }
    if (typeKey === 'minutes' && roleMap.secretary && roleMap.secretary.email === submitterEmail) {
      submitterRoleMatch = true;
    }
    if (typeKey === 'proof_of_payment' && roleMap.treasurer && roleMap.treasurer.email === submitterEmail) {
      submitterRoleMatch = true;
    }
  }

  if (submitterRoleMatch && stages[0] === autoRole) {
    // Auto-approve first stage; move to index 1 (or fully approved if only one stage)
    if (stages.length === 1) {
      return { index: stages.length, role: '', autoApproved: true, fullyApproved: true };
    }
    return { index: 1, role: stages[1], autoApproved: true, fullyApproved: false };
  }
  return { index: 0, role: stages[0], autoApproved: false, fullyApproved: false };
}

function submitItem_(payload) {
  requireSetup_();
  var ctx = requireKnownUser_();
  var typeKey = payload.type;
  var def = getDocType_(typeKey);

  if (!canSubmitType_(ctx, typeKey)) {
    throw new Error('You are not allowed to submit ' + def.label + '.');
  }

  var title = String(payload.title || '').trim();
  if (!title) throw new Error('Title is required.');
  if (!payload.fileBase64 || !payload.fileName) throw new Error('A document file is required.');

  var mime = payload.mimeType || '';
  // Allow common office/image/pdf; Google native types come from Drive pick differently — base64 upload path
  var bytes = Utilities.base64Decode(payload.fileBase64);
  var blob = Utilities.newBlob(bytes, mime || 'application/octet-stream', payload.fileName);

  var saved = saveUploadedFile_(typeKey, title, 1, blob, payload.fileName, mime);
  var stage = computeInitialStage_(typeKey, ctx.email, ctx.roleMap);
  var now = nowIso_();
  var id = newId_('item');

  var item = {
    id: id,
    type: typeKey,
    title: title,
    status: stage.fullyApproved ? ITEM_STATUS.APPROVED : ITEM_STATUS.PENDING,
    current_stage_index: stage.fullyApproved ? def.stages.length : stage.index,
    current_stage_role: stage.fullyApproved ? '' : stage.role,
    submitter_email: ctx.email,
    file_id: saved.fileId,
    file_url: saved.fileUrl,
    file_name: saved.fileName,
    mime_type: saved.mimeType,
    folder_id: saved.folderId,
    decline_note: '',
    declined_by: '',
    created_at: now,
    updated_at: now,
    last_action_at: now,
    version: 1,
    reopened_from: payload.reopenedFrom || ''
  };

  appendRow_(SHEETS.ITEMS, item);

  if (stage.autoApproved) {
    appendRow_(SHEETS.APPROVALS, {
      id: newId_('apr'),
      item_id: id,
      stage_role: def.stages[0],
      stage_index: 0,
      action: 'auto_approved_on_submit',
      actor_email: ctx.email,
      actor_name: displayNameForEmail_(ctx.email, ctx.roleMap),
      note: 'First stage auto-approved because submitter holds that role',
      timestamp: now
    });
  }

  if (stage.fullyApproved) {
    item.folder_id = moveFileToPath_(item.file_id, def.folderApproved);
    updateRowById_(SHEETS.ITEMS, id, { folder_id: item.folder_id, status: ITEM_STATUS.APPROVED });
  }

  audit_(id, 'submitted', ctx.email, { type: typeKey, title: title, autoApproved: stage.autoApproved });
  try {
    notifySubmitted_(item, ctx);
  } catch (eNotify) {
    console.error('notifySubmitted_ failed: ' + (eNotify.message || eNotify));
  }
  return enrichItem_(findById_(SHEETS.ITEMS, id), ctx);
}

function approveItem_(itemId, note) {
  requireSetup_();
  var ctx = requireKnownUser_();
  var item = findById_(SHEETS.ITEMS, itemId);
  if (!item) throw new Error('Item not found.');
  try {
    item = healPendingItemFromHistory_(item) || item;
  } catch (eHeal) {}
  if (item.status !== ITEM_STATUS.PENDING) throw new Error('Item is not pending.');

  var isStageHolder = !!(item.current_stage_role && ctx.roles.indexOf(item.current_stage_role) >= 0);
  if (!isStageHolder && !ctx.isAdmin) {
    throw new Error('You are not the current approver for this stage.');
  }
  // Admin approving a stage they do not hold → force-approve in the stage holder's name
  if (ctx.isAdmin && !isStageHolder) {
    return adminForceApprove_(itemId, note);
  }

  return advanceApproval_(item, ctx.email, note || '', false, ctx);
}

function declineItem_(itemId, note) {
  requireSetup_();
  var ctx = requireKnownUser_();
  var item = findById_(SHEETS.ITEMS, itemId);
  if (!item) throw new Error('Item not found.');
  if (item.status !== ITEM_STATUS.PENDING) throw new Error('Item is not pending.');
  if (!canActOnCurrentStage_(ctx, item)) {
    throw new Error('Only the current-stage approver (or admin) can decline.');
  }
  note = String(note || '').trim();
  if (!note) throw new Error('A decline reason is required.');

  var def = getDocType_(item.type);
  var roleMap = getRoleMap_();
  var now = nowIso_();
  var actorName = displayNameForEmail_(ctx.email, roleMap);

  appendRow_(SHEETS.APPROVALS, {
    id: newId_('apr'),
    item_id: item.id,
    stage_role: item.current_stage_role,
    stage_index: item.current_stage_index,
    action: 'declined',
    actor_email: ctx.email,
    actor_name: actorName,
    note: note,
    timestamp: now
  });

  var folderId = moveFileToPath_(item.file_id, def.folderDeclined);
  attachDeclineNote_(item.file_id, actorName + ' <' + ctx.email + '>', note, item.title);

  var patch = {
    status: ITEM_STATUS.DECLINED,
    decline_note: note,
    declined_by: ctx.email,
    current_stage_role: '',
    folder_id: folderId,
    updated_at: now,
    last_action_at: now
  };
  updateRowById_(SHEETS.ITEMS, item.id, patch);
  var updated = findById_(SHEETS.ITEMS, item.id);
  audit_(item.id, 'declined', ctx.email, { note: note, actorName: actorName });
  try {
    notifyStageUpdate_(updated, ctx.email, 'declined');
  } catch (eMail) {
    console.error('notify declined failed: ' + (eMail.message || eMail));
  }
  return enrichItem_(updated, ctx);
}

function advanceApproval_(item, actorEmail, note, isForce, actingCtx) {
  var def = getDocType_(item.type);
  var roleMap = getRoleMap_();
  var now = nowIso_();
  var idx = Number(item.current_stage_index);
  if (!isFinite(idx) || idx < 0) idx = 0;
  var stageRole = item.current_stage_role || def.stages[idx] || '';

  var recordedEmail = actorEmail;
  var recordedName = displayNameForEmail_(actorEmail, roleMap);
  var recordedNote = note || '';
  var recordedAction = isForce ? 'force_approved' : 'approved';

  if (isForce) {
    var holderEmail = (roleMap[stageRole] && roleMap[stageRole].email) || '';
    recordedEmail = holderEmail || actorEmail;
    recordedName = displayNameForRole_(stageRole, roleMap);
    var adminName = displayNameForEmail_((actingCtx && actingCtx.email) || actorEmail, roleMap);
    recordedNote =
      (note ? String(note).trim() + ' — ' : '') +
      'Force-approved by Admin (' + adminName + ') on behalf of ' +
      recordedName + ' (' + (ROLE_LABELS[stageRole] || stageRole) + ')';
  }

  var nextIdx = idx + 1;
  var isFinal = nextIdx >= def.stages.length;
  var patch = {
    updated_at: now,
    last_action_at: now
  };
  if (isFinal) {
    patch.status = ITEM_STATUS.APPROVED;
    patch.current_stage_index = def.stages.length;
    patch.current_stage_role = '';
  } else {
    patch.current_stage_index = nextIdx;
    patch.current_stage_role = def.stages[nextIdx];
  }

  // Sheet is source of truth — update before Drive/mail so a move/mail failure
  // cannot leave Approvals ahead of Items (stuck "waiting on" UI).
  updateRowById_(SHEETS.ITEMS, item.id, patch);

  appendRow_(SHEETS.APPROVALS, {
    id: newId_('apr'),
    item_id: item.id,
    stage_role: stageRole,
    stage_index: idx,
    action: recordedAction,
    actor_email: recordedEmail,
    actor_name: recordedName,
    note: recordedNote,
    timestamp: now
  });

  if (isFinal) {
    try {
      var folderId = moveFileToPath_(item.file_id, def.folderApproved);
      updateRowById_(SHEETS.ITEMS, item.id, { folder_id: folderId });
    } catch (eMove) {
      console.error('advanceApproval_ move failed for ' + item.id + ': ' + (eMove.message || eMove));
      try {
        audit_(item.id, 'approved_move_failed', recordedEmail, { error: String(eMove.message || eMove) });
      } catch (eAudMove) {}
    }
    try {
      audit_(item.id, isForce ? 'force_approved_final' : 'approved_final', recordedEmail, {
        actorName: recordedName,
        forceBy: isForce ? ((actingCtx && actingCtx.email) || '') : ''
      });
    } catch (eAud) {}
    var done = findById_(SHEETS.ITEMS, item.id);
    try {
      notifyStageUpdate_(done, recordedEmail, 'approved_final');
    } catch (eMail) {
      console.error('notify approved_final failed: ' + (eMail.message || eMail));
    }
    return enrichItem_(done, getUserContext_());
  }

  try {
    audit_(item.id, isForce ? 'force_approved_stage' : 'approved_stage', recordedEmail, {
      next: def.stages[nextIdx],
      actorName: recordedName
    });
  } catch (eAud2) {}
  var updated = findById_(SHEETS.ITEMS, item.id);
  try {
    notifyStageUpdate_(updated, recordedEmail, 'approved_stage');
  } catch (eMail2) {
    console.error('notify approved_stage failed: ' + (eMail2.message || eMail2));
  }
  return enrichItem_(updated, getUserContext_());
}

/**
 * If Approvals history is ahead of Items (e.g. old bug: approval logged then move/mail threw),
 * advance or complete the item so the dashboard matches history.
 */
function healPendingItemFromHistory_(item) {
  if (!item || String(item.status) !== ITEM_STATUS.PENDING) return item;
  var def = getDocType_(item.type);
  if (!def || !def.stages || !def.stages.length) return item;

  var approvals = listApprovalsForItem_(item.id);
  var approvedIdx = {};
  var declined = false;
  approvals.forEach(function (a) {
    var action = String(a.action || '');
    if (action === 'declined') declined = true;
    if (
      action === 'approved' ||
      action === 'force_approved' ||
      action === 'auto_approved_on_submit' ||
      action.indexOf('approved') === 0
    ) {
      var si = Number(a.stage_index);
      if (isFinite(si) && si >= 0) approvedIdx[si] = true;
    }
  });
  if (declined) return item;

  var maxDone = -1;
  for (var i = 0; i < def.stages.length; i++) {
    if (approvedIdx[i]) maxDone = i;
    else break; // require contiguous stages from the start
  }
  if (maxDone < 0) return item;

  var cur = Number(item.current_stage_index);
  if (!isFinite(cur) || cur < 0) cur = 0;
  var targetIdx = maxDone + 1;
  var now = nowIso_();

  if (targetIdx >= def.stages.length) {
    if (String(item.status) === ITEM_STATUS.APPROVED && cur >= def.stages.length) return item;
    var patchDone = {
      status: ITEM_STATUS.APPROVED,
      current_stage_index: def.stages.length,
      current_stage_role: '',
      updated_at: now,
      last_action_at: now
    };
    try {
      var folderId = moveFileToPath_(item.file_id, def.folderApproved);
      patchDone.folder_id = folderId;
    } catch (eMove) {
      console.error('heal move failed for ' + item.id + ': ' + (eMove.message || eMove));
    }
    updateRowById_(SHEETS.ITEMS, item.id, patchDone);
    try {
      audit_(item.id, 'healed_approved_from_history', '', { maxDone: maxDone });
    } catch (eA) {}
    var healedDone = findById_(SHEETS.ITEMS, item.id);
    try {
      notifyStageUpdate_(healedDone, item.submitter_email || '', 'approved_final');
    } catch (eN) {}
    return healedDone;
  }

  if (targetIdx > cur || String(item.current_stage_role) !== String(def.stages[targetIdx])) {
    updateRowById_(SHEETS.ITEMS, item.id, {
      current_stage_index: targetIdx,
      current_stage_role: def.stages[targetIdx],
      updated_at: now,
      last_action_at: now
    });
    try {
      audit_(item.id, 'healed_stage_from_history', '', { to: def.stages[targetIdx], maxDone: maxDone });
    } catch (eA2) {}
    return findById_(SHEETS.ITEMS, item.id);
  }
  return item;
}

function adminForceApprove_(itemId, note) {
  requireSetup_();
  var ctx = requireKnownUser_();
  if (!ctx.isAdmin) throw new Error('Admin only.');
  var item = findById_(SHEETS.ITEMS, itemId);
  if (!item) throw new Error('Item not found.');
  try {
    item = healPendingItemFromHistory_(item) || item;
  } catch (eHeal) {}
  if (item.status !== ITEM_STATUS.PENDING) throw new Error('Item is not pending.');
  return advanceApproval_(item, ctx.email, note || '', true, ctx);
}

function adminSkipStage_(itemId, note) {
  return adminForceApprove_(itemId, note || 'Admin skipped stage');
}

function deleteItem_(itemId) {
  requireSetup_();
  var ctx = requireKnownUser_();
  if (!ctx.isAdmin) throw new Error('Only Admin can delete documents.');
  var item = findById_(SHEETS.ITEMS, itemId);
  if (!item) throw new Error('Item not found.');

  trashWorkflowFile_(item.file_id);
  var sheet = getDb_().getSheetByName(SHEETS.ITEMS);
  if (item._row) {
    sheet.deleteRow(item._row);
  } else {
    // reload to find row
    var fresh = findById_(SHEETS.ITEMS, itemId);
    if (fresh && fresh._row) sheet.deleteRow(fresh._row);
  }
  audit_(itemId, 'deleted', ctx.email, {
    title: item.title,
    type: item.type,
    by: displayNameForEmail_(ctx.email)
  });
  return { deleted: true, id: itemId };
}

function isSecretary_(ctx) {
  return !!(ctx && ctx.roles && ctx.roles.indexOf('secretary') >= 0);
}

function canSeeArchivedItems_(ctx) {
  return !!(ctx && (ctx.isAdmin || isSecretary_(ctx)));
}

/**
 * Archive an approved workflow tile. Drive file location/sharing is NOT changed.
 * After archive, only Admin and Secretary can see the tile (Secretary view-only).
 */
function archiveItem_(itemId) {
  requireSetup_();
  var ctx = requireKnownUser_();
  if (!ctx.isAdmin) throw new Error('Only Admin can archive documents.');
  var item = findById_(SHEETS.ITEMS, itemId);
  if (!item) throw new Error('Item not found.');
  if (item.status !== ITEM_STATUS.APPROVED) {
    throw new Error('Only fully approved documents can be archived.');
  }
  var now = nowIso_();
  var actorName = displayNameForEmail_(ctx.email, ctx.roleMap);
  updateRowById_(SHEETS.ITEMS, item.id, {
    status: ITEM_STATUS.ARCHIVED,
    updated_at: now,
    last_action_at: now
  });
  appendRow_(SHEETS.APPROVALS, {
    id: newId_('apr'),
    item_id: item.id,
    stage_role: '',
    stage_index: -1,
    action: 'archived',
    actor_email: ctx.email,
    actor_name: actorName,
    note: 'Archived in workflow only — Drive file was not moved or changed.',
    timestamp: now
  });
  audit_(item.id, 'archived', ctx.email, {
    title: item.title,
    by: actorName,
    driveUnchanged: true
  });
  return enrichItem_(findById_(SHEETS.ITEMS, item.id), ctx);
}

/**
 * Restore archived tile back to approved (still no Drive changes).
 */
function unarchiveItem_(itemId) {
  requireSetup_();
  var ctx = requireKnownUser_();
  if (!ctx.isAdmin) throw new Error('Only Admin can unarchive documents.');
  var item = findById_(SHEETS.ITEMS, itemId);
  if (!item) throw new Error('Item not found.');
  if (item.status !== ITEM_STATUS.ARCHIVED) {
    throw new Error('Only archived documents can be unarchived.');
  }
  var now = nowIso_();
  var actorName = displayNameForEmail_(ctx.email, ctx.roleMap);
  updateRowById_(SHEETS.ITEMS, item.id, {
    status: ITEM_STATUS.APPROVED,
    updated_at: now,
    last_action_at: now
  });
  appendRow_(SHEETS.APPROVALS, {
    id: newId_('apr'),
    item_id: item.id,
    stage_role: '',
    stage_index: -1,
    action: 'unarchived',
    actor_email: ctx.email,
    actor_name: actorName,
    note: 'Restored to approved in workflow — Drive file was not moved or changed.',
    timestamp: now
  });
  audit_(item.id, 'unarchived', ctx.email, {
    title: item.title,
    by: actorName,
    driveUnchanged: true
  });
  return enrichItem_(findById_(SHEETS.ITEMS, item.id), ctx);
}

function editReplaceFile_(itemId, payload) {
  requireSetup_();
  var ctx = requireKnownUser_();
  var item = findById_(SHEETS.ITEMS, itemId);
  if (!item) throw new Error('Item not found.');
  if (item.status === ITEM_STATUS.APPROVED) {
    throw new Error('Fully approved items cannot be edited. Submit a new document instead.');
  }
  if (!canEditItem_(ctx, item)) throw new Error('You cannot edit this document.');

  if (!payload.fileBase64 || !payload.fileName) throw new Error('Replacement file is required.');
  var bytes = Utilities.base64Decode(payload.fileBase64);
  var blob = Utilities.newBlob(bytes, payload.mimeType || 'application/octet-stream', payload.fileName);
  var saved = replaceFileContent_(item, blob, payload.fileName, payload.mimeType);
  var def = getDocType_(item.type);
  var stage = computeInitialStage_(item.type, item.submitter_email, ctx.roleMap);
  var now = nowIso_();
  var newVersion = Number(item.version || 1) + 1;

  // Clear prior approval rows visually by audit; keep history in Approvals sheet
  appendRow_(SHEETS.APPROVALS, {
    id: newId_('apr'),
    item_id: item.id,
    stage_role: '',
    stage_index: -1,
    action: 'reset_on_edit',
    actor_email: ctx.email,
    note: 'All approvals reset after document edit',
    timestamp: now
  });

  // Ensure file in pending folder
  var pendingFolder = moveFileToPath_(saved.fileId, def.folderPending);

  updateRowById_(SHEETS.ITEMS, item.id, {
    status: ITEM_STATUS.PENDING,
    current_stage_index: stage.index,
    current_stage_role: stage.role,
    file_id: saved.fileId,
    file_url: saved.fileUrl,
    file_name: saved.fileName,
    mime_type: saved.mimeType,
    folder_id: pendingFolder,
    decline_note: '',
    declined_by: '',
    version: newVersion,
    updated_at: now,
    last_action_at: now
  });

  if (stage.autoApproved) {
    appendRow_(SHEETS.APPROVALS, {
      id: newId_('apr'),
      item_id: item.id,
      stage_role: def.stages[0],
      stage_index: 0,
      action: 'auto_approved_on_submit',
      actor_email: item.submitter_email,
      note: 'Re-applied after edit reset',
      timestamp: now
    });
    if (stage.fullyApproved) {
      // unlikely for multi-stage
    } else {
      updateRowById_(SHEETS.ITEMS, item.id, {
        current_stage_index: stage.index,
        current_stage_role: stage.role
      });
    }
  }

  var updated = findById_(SHEETS.ITEMS, item.id);
  audit_(item.id, 'edited_reset', ctx.email, { version: newVersion });
  notifyStageUpdate_(updated, ctx.email, 'reset');
  return enrichItem_(updated, ctx);
}

function reopenItem_(itemId) {
  requireSetup_();
  var ctx = requireKnownUser_();
  var item = findById_(SHEETS.ITEMS, itemId);
  if (!item) throw new Error('Item not found.');
  if (item.status !== ITEM_STATUS.DECLINED) throw new Error('Only declined items can be reopened.');

  var isSubmitter = String(item.submitter_email).toLowerCase() === ctx.email;
  if (!isSubmitter && !ctx.isAdmin) throw new Error('Only the submitter or admin can reopen.');

  var def = getDocType_(item.type);
  var stage = computeInitialStage_(item.type, item.submitter_email, ctx.roleMap);
  var now = nowIso_();
  var folderId = moveFileToPath_(item.file_id, def.folderPending);

  updateRowById_(SHEETS.ITEMS, item.id, {
    status: ITEM_STATUS.PENDING,
    current_stage_index: stage.index,
    current_stage_role: stage.role,
    folder_id: folderId,
    // Keep decline_note in history fields but clear blocking state visually via approvals log
    updated_at: now,
    last_action_at: now
  });

  appendRow_(SHEETS.APPROVALS, {
    id: newId_('apr'),
    item_id: item.id,
    stage_role: '',
    stage_index: -1,
    action: 'reopened',
    actor_email: ctx.email,
    note: 'Reopened after decline. Prior decline reason retained in history: ' + (item.decline_note || ''),
    timestamp: now
  });

  if (stage.autoApproved) {
    appendRow_(SHEETS.APPROVALS, {
      id: newId_('apr'),
      item_id: item.id,
      stage_role: def.stages[0],
      stage_index: 0,
      action: 'auto_approved_on_submit',
      actor_email: item.submitter_email,
      note: 'Auto-applied on reopen',
      timestamp: now
    });
  }

  var updated = findById_(SHEETS.ITEMS, item.id);
  audit_(item.id, 'reopened', ctx.email, {});
  notifySubmitted_(updated, ctx);
  return enrichItem_(updated, ctx);
}

function enrichItem_(item, ctx, opt) {
  if (!item) return null;
  opt = opt || {};
  var def = getDocType_(item.type);
  var roleMap = opt.roleMap || getRoleMap_();
  var rawApprovals = opt.approvals || listApprovalsForItem_(item.id);
  var approvals = rawApprovals.map(function (a) {
    var name = String(a.actor_name || '').trim() || displayNameForEmail_(a.actor_email, roleMap);
    return {
      id: a.id,
      item_id: a.item_id,
      stage_role: a.stage_role,
      stage_index: a.stage_index,
      action: a.action,
      actor_email: a.actor_email,
      actor_name: name,
      note: a.note,
      timestamp: a.timestamp,
      display: name + (a.actor_email ? ' <' + a.actor_email + '>' : '')
    };
  });
  var submitterName = displayNameForEmail_(item.submitter_email, roleMap);
  var declinedByName = item.declined_by ? displayNameForEmail_(item.declined_by, roleMap) : '';
  var isArchived = item.status === ITEM_STATUS.ARCHIVED;
  var canSee = !isArchived || canSeeArchivedItems_(ctx);
  return {
    id: item.id,
    type: item.type,
    typeLabel: def.label,
    title: item.title,
    status: item.status,
    statusLabel: statusLabel_(item),
    progress: stageProgressText_(item),
    currentStageIndex: Number(item.current_stage_index),
    currentStageRole: item.current_stage_role,
    currentStageName: item.current_stage_role ? displayNameForRole_(item.current_stage_role, roleMap) : '',
    stages: def.stages.map(function (r) {
      return {
        role: r,
        label: ROLE_LABELS[r] || r,
        name: displayNameForRole_(r, roleMap)
      };
    }),
    submitterEmail: item.submitter_email,
    submitterName: submitterName,
    fileId: item.file_id,
    fileUrl: item.file_url,
    fileName: item.file_name,
    mimeType: item.mime_type,
    declineNote: item.decline_note,
    declinedBy: item.declined_by,
    declinedByName: declinedByName,
    createdAt: item.created_at,
    updatedAt: item.updated_at,
    lastActionAt: item.last_action_at,
    version: item.version,
    approvals: approvals,
    permissions: {
      canApprove: !isArchived && !!(item.current_stage_role && ctx.roles.indexOf(item.current_stage_role) >= 0) && item.status === ITEM_STATUS.PENDING,
      canDecline: !isArchived && canActOnCurrentStage_(ctx, item),
      canEdit: !isArchived && canEditItem_(ctx, item) && item.status !== ITEM_STATUS.APPROVED,
      canReopen: !isArchived && item.status === ITEM_STATUS.DECLINED && (ctx.isAdmin || ctx.email === String(item.submitter_email).toLowerCase()),
      canForce: !isArchived && ctx.isAdmin && item.status === ITEM_STATUS.PENDING,
      canDelete: ctx.isAdmin,
      canArchive: ctx.isAdmin && item.status === ITEM_STATUS.APPROVED,
      canUnarchive: ctx.isAdmin && item.status === ITEM_STATUS.ARCHIVED,
      canView: canSee
    }
  };
}

function listEnrichedItems_(filter) {
  var ctx = requireKnownUser_();
  requireSetup_();
  var roleMap = getRoleMap_();
  var items = listItems_();
  if (filter && filter.type) {
    items = items.filter(function (i) { return i.type === filter.type; });
  }
  if (filter && filter.status) {
    items = items.filter(function (i) { return i.status === filter.status; });
  }
  // Archived tiles: Admin + Secretary only (Secretary is view-only via permissions)
  items = items.filter(function (i) {
    if (i.status === ITEM_STATUS.ARCHIVED) return canSeeArchivedItems_(ctx);
    return true;
  });
  // Newest first
  items.sort(function (a, b) {
    return String(b.created_at).localeCompare(String(a.created_at));
  });

  // One Approvals sheet read for the whole list (was N reads + heal/Drive — very slow)
  var approvalsByItem = {};
  try {
    sheetToObjects_(getDb_().getSheetByName(SHEETS.APPROVALS)).forEach(function (a) {
      var id = String(a.item_id || '');
      if (!id) return;
      if (!approvalsByItem[id]) approvalsByItem[id] = [];
      approvalsByItem[id].push(a);
    });
  } catch (eApr) {}

  return items.map(function (i) {
    return enrichItem_(i, ctx, {
      roleMap: roleMap,
      approvals: approvalsByItem[String(i.id)] || []
    });
  });
}
