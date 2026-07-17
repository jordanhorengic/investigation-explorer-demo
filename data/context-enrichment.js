(function () {
  const mock = window.INVESTIGATION_MOCK;
  const EA = window.EntityAttachments;
  if (!mock || !EA) {
    return;
  }

  const byId = new Map(mock.entities.map((entity) => [entity.id, entity]));

  function attach(entityId, attachment) {
    const entity = byId.get(entityId);
    if (!entity) {
      return;
    }
    EA.ensureAttachments(entity).push(EA.createAttachment(attachment));
    EA.normalizePersonPhotoFlags(entity);
  }

  const manualOverlay = window.MANUAL_ATTACHMENTS;
  if (Array.isArray(manualOverlay)) {
    for (const entry of manualOverlay) {
      if (!entry?.entityId || !entry.attachment) {
        continue;
      }
      attach(entry.entityId, entry.attachment);
    }
  }
})();
