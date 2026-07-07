(function () {
  const LOCATION_ROLES = ['Home', 'Work', 'Whereabouts', 'Headquarter', 'Branch'];
  const NUMERIC_FIELDS = new Set(['GEO_LAT', 'GEO_LON']);

  let options = null;
  let relationshipCounter = 0;
  let attachmentCounter = 0;
  let draftRelationships = [];
  let draftAttachments = [];

  const els = {};

  function getFieldsForType(typeId) {
    if (!typeId || !options) {
      return [];
    }
    return SearchFilters.getAvailableFields(options.attributeCatalog, new Set([typeId])).filter(
      (fieldId) => !SearchFilters.METADATA_FIELDS.has(fieldId)
    );
  }

  function generateEntityId() {
    let max = 0;
    for (const entity of options.entities) {
      const match = entity.id.match(/-(\d{12})$/);
      if (match) {
        max = Math.max(max, Number.parseInt(match[1], 10));
      }
    }
    return `a1b2c3d4-0000-0000-0000-${String(max + 1).padStart(12, '0')}`;
  }

  function inputTypeForField(fieldId) {
    if (NUMERIC_FIELDS.has(fieldId)) {
      return 'number';
    }
    if (/DATUM|GEBURT|DATE/i.test(fieldId)) {
      return 'date';
    }
    return 'text';
  }

  function inputStepForField(fieldId) {
    return NUMERIC_FIELDS.has(fieldId) ? 'any' : null;
  }

  function buildRelationshipLabelSuggestions() {
    const labels = new Set();
    for (const relation of options.relations) {
      if (relation.label) {
        labels.add(relation.label);
      }
    }
    return [...labels].sort((a, b) => a.localeCompare(b));
  }

  function buildEntitySelectOptions(excludeId = null) {
    const groups = new Map(options.objectTypes.map((type) => [type.id, []]));
    for (const entity of options.entities) {
      if (entity.id === excludeId) {
        continue;
      }
      if (!groups.has(entity.type)) {
        groups.set(entity.type, []);
      }
      groups.get(entity.type).push(entity);
    }

    const fragments = [];
    for (const type of options.objectTypes) {
      const items = groups.get(type.id) || [];
      if (items.length === 0) {
        continue;
      }
      items.sort((a, b) =>
        DisplayNames.displayName(a, options.lookup).localeCompare(DisplayNames.displayName(b, options.lookup))
      );
      const inner = items
        .map((entity) => {
          const label = `${DisplayNames.displayName(entity, options.lookup)} · ${entity.type}`;
          return `<option value="${entity.id}">${label.replace(/"/g, '&quot;')}</option>`;
        })
        .join('');
      fragments.push(`<optgroup label="${type.id.replace(/"/g, '&quot;')}">${inner}</optgroup>`);
    }
    return fragments.join('');
  }

  function setStatus(message, tone = 'info') {
    if (!els.status) {
      return;
    }
    els.status.textContent = message;
    els.status.classList.remove('hidden', 'new-object-status--success', 'new-object-status--error');
    if (tone === 'success') {
      els.status.classList.add('new-object-status--success');
    }
    if (tone === 'error') {
      els.status.classList.add('new-object-status--error');
    }
  }

  function clearStatus() {
    if (!els.status) {
      return;
    }
    els.status.textContent = '';
    els.status.classList.add('hidden');
    els.status.classList.remove('new-object-status--success', 'new-object-status--error');
  }

  function renderAttributeFields() {
    const typeId = els.typeSelect.value;
    const fields = getFieldsForType(typeId);

    els.attributes.innerHTML = '';
    els.attributesEmpty.classList.toggle('hidden', fields.length > 0);

    for (const fieldId of fields) {
      const field = document.createElement('label');
      field.className = 'new-object-field';
      const inputType = inputTypeForField(fieldId);
      const step = inputStepForField(fieldId);
      field.innerHTML = `
        <span class="new-object-field__label">${DisplayNames.formatFieldLabel(fieldId)}</span>
        <input
          class="new-object-field__input"
          type="${inputType}"
          name="${fieldId}"
          data-field-id="${fieldId}"
          ${step ? `step="${step}"` : ''}
          autocomplete="off"
        />
      `;
      els.attributes.appendChild(field);
    }
  }

  function createRelationshipRow(draft = {}) {
    relationshipCounter += 1;
    const rowId = draft.id || `rel-${relationshipCounter}`;
    const row = document.createElement('div');
    row.className = 'new-object-relationship';
    row.dataset.rowId = rowId;

    row.innerHTML = `
      <select class="new-object-relationship__direction" aria-label="Relationship direction">
        <option value="outgoing" ${draft.direction !== 'incoming' ? 'selected' : ''}>This object →</option>
        <option value="incoming" ${draft.direction === 'incoming' ? 'selected' : ''}>→ This object</option>
      </select>
      <select class="new-object-relationship__target" aria-label="Related object">
        <option value="">Select related object…</option>
        ${buildEntitySelectOptions()}
      </select>
      <input
        class="new-object-relationship__label"
        type="text"
        list="new-object-relationship-labels"
        placeholder="Relationship label"
        value="${draft.label || ''}"
        aria-label="Relationship label"
      />
      <select class="new-object-relationship__role hidden" aria-label="Location role">
        <option value="">Role…</option>
        ${LOCATION_ROLES.map((role) => `<option value="${role}" ${draft.role === role ? 'selected' : ''}>${role}</option>`).join('')}
      </select>
      <button class="icon-btn icon-btn--ghost new-object-relationship__remove" type="button" aria-label="Remove relationship">×</button>
    `;

    const targetSelect = row.querySelector('.new-object-relationship__target');
    const roleSelect = row.querySelector('.new-object-relationship__role');
    if (draft.targetId) {
      targetSelect.value = draft.targetId;
    }

    function relationshipInvolvesLocation() {
      const target = options.lookup.get(targetSelect.value);
      const newType = els.typeSelect.value;
      if (target?.type === 'Location') {
        return true;
      }
      return newType === 'Location' && Boolean(targetSelect.value);
    }

    function syncRoleVisibility() {
      const showRole = relationshipInvolvesLocation();
      roleSelect.classList.toggle('hidden', !showRole);
      if (!showRole) {
        roleSelect.value = '';
      }
    }

    targetSelect.addEventListener('change', syncRoleVisibility);
    row.querySelector('.new-object-relationship__direction').addEventListener('change', syncRoleVisibility);
    row.querySelector('.new-object-relationship__remove').addEventListener('click', () => {
      draftRelationships = draftRelationships.filter((entry) => entry.id !== rowId);
      row.remove();
      els.relationshipsEmpty.classList.toggle('hidden', els.relationships.children.length > 0);
    });

    syncRoleVisibility();
    els.relationships.appendChild(row);
    els.relationshipsEmpty.classList.add('hidden');
    draftRelationships.push({ id: rowId, ...draft });
  }

  function readAttributeValues() {
    const attributes = {};
    for (const input of els.attributes.querySelectorAll('[data-field-id]')) {
      const fieldId = input.dataset.fieldId;
      const raw = input.value.trim();
      if (!raw) {
        continue;
      }
      if (NUMERIC_FIELDS.has(fieldId)) {
        const parsed = Number.parseFloat(raw);
        if (Number.isNaN(parsed)) {
          throw new Error(`${DisplayNames.formatFieldLabel(fieldId)} must be a number.`);
        }
        attributes[fieldId] = parsed;
      } else {
        attributes[fieldId] = raw;
      }
    }
    return attributes;
  }

  function relationshipInvolvesLocation(targetId, direction, newType) {
    const target = options.lookup.get(targetId);
    if (target?.type === 'Location') {
      return true;
    }
    return newType === 'Location' && Boolean(targetId);
  }

  function readRelationships(entity) {
    const parsed = [];
    for (const row of els.relationships.querySelectorAll('.new-object-relationship')) {
      const direction = row.querySelector('.new-object-relationship__direction').value;
      const targetId = row.querySelector('.new-object-relationship__target').value;
      const label = row.querySelector('.new-object-relationship__label').value.trim();
      const role = row.querySelector('.new-object-relationship__role').value;
      const target = options.lookup.get(targetId);

      if (!targetId && !label) {
        continue;
      }
      if (!targetId) {
        throw new Error('Each relationship needs a related object selected.');
      }
      if (!label) {
        throw new Error('Each relationship needs a label.');
      }
      if (relationshipInvolvesLocation(targetId, direction, entity.type) && !role) {
        throw new Error('Location relationships need a role (Home, Work, etc.).');
      }

      const from = direction === 'incoming' ? targetId : entity.id;
      const to = direction === 'incoming' ? entity.id : targetId;
      const relation = { from, to, label };

      if (target?.type === 'Location' || entity.type === 'Location') {
        const sourceEntity = from === entity.id ? entity : options.lookup.get(from);
        relation.kind = 'location';
        relation.role = role;
        if (sourceEntity?.type === 'Person') {
          const personRoles = {
            Home: 'Person_Wohnsitz_Oertlichkeit',
            Work: 'Person_Arbeitsstaette_Oertlichkeit',
            Whereabouts: 'Person_Aufenthaltsort_Oertlichkeit',
          };
          relation.relationshipType = personRoles[role] || 'Person_Wohnsitz_Oertlichkeit';
        } else if (sourceEntity?.type === 'Organisation') {
          relation.relationshipType =
            role === 'Branch' ? 'Organisation_Niederlassung_Oertlichkeit' : 'Organisation_Sitz_Oertlichkeit';
        }
      }

      parsed.push(relation);
    }
    return parsed;
  }

  function syncPersonPhotoOptionVisibility() {
    const isPerson = els.typeSelect.value === 'Person';
    els.personPhotoWrap.classList.toggle('hidden', !isPerson);
    if (!isPerson) {
      els.personPhotoInput.checked = false;
    }
  }

  function renderDraftAttachments() {
    els.attachments.innerHTML = '';
    els.attachmentsEmpty.classList.toggle('hidden', draftAttachments.length > 0);

    for (const draft of draftAttachments) {
      const row = document.createElement('div');
      row.className = 'new-object-attachment';
      row.dataset.attachmentId = draft.id;

      const preview = document.createElement('div');
      preview.className = 'new-object-attachment__preview';
      if (draft.kind === 'image' && draft.url) {
        preview.innerHTML = `<img src="${draft.url}" alt="" />`;
      } else {
        preview.innerHTML = `<span class="new-object-attachment__doc">${draft.fileName.split('.').pop()?.toUpperCase() || 'DOC'}</span>`;
      }

      const meta = document.createElement('div');
      meta.className = 'new-object-attachment__meta';
      meta.innerHTML = `
        <strong>${draft.tag}</strong>
        <span>${draft.fileName}${draft.isPersonPhoto ? ' · Person photo' : ''}</span>
      `;

      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'icon-btn icon-btn--ghost new-object-attachment__remove';
      remove.setAttribute('aria-label', 'Remove file');
      remove.textContent = '×';
      remove.addEventListener('click', () => {
        draftAttachments = draftAttachments.filter((entry) => entry.id !== draft.id);
        renderDraftAttachments();
      });

      row.appendChild(preview);
      row.appendChild(meta);
      row.appendChild(remove);
      els.attachments.appendChild(row);
    }
  }

  async function handleAddAttachment() {
    clearStatus();
    const file = els.fileInput.files?.[0];
    const tag = els.fileTagInput.value.trim();

    if (!file) {
      setStatus('Choose a file to upload.', 'error');
      return;
    }
    if (!tag) {
      setStatus('Add a tag describing the file.', 'error');
      return;
    }

    try {
      const url = await EntityAttachments.readFileAsDataUrl(file);
      const isPersonPhoto =
        els.typeSelect.value === 'Person' && els.personPhotoInput.checked && file.type.startsWith('image/');

      if (els.personPhotoInput.checked && !file.type.startsWith('image/')) {
        throw new Error('Only image files can be marked as a person photo.');
      }

      if (isPersonPhoto) {
        for (const draft of draftAttachments) {
          draft.isPersonPhoto = false;
        }
      }

      attachmentCounter += 1;
      draftAttachments.push(
        EntityAttachments.createAttachment({
          id: `draft-att-${attachmentCounter}`,
          fileName: file.name,
          mimeType: file.type || 'application/octet-stream',
          tag,
          url,
          isPersonPhoto,
        })
      );

      els.fileInput.value = '';
      els.fileTagInput.value = '';
      els.personPhotoInput.checked = false;
      renderDraftAttachments();
    } catch (error) {
      setStatus(error.message || 'Could not add file.', 'error');
    }
  }

  function readDraftAttachmentsForEntity(entity) {
    const attachments = draftAttachments.map((draft) =>
      EntityAttachments.createAttachment({
        fileName: draft.fileName,
        mimeType: draft.mimeType,
        tag: draft.tag,
        url: draft.url,
        isPersonPhoto: entity.type === 'Person' ? draft.isPersonPhoto : false,
      })
    );
    EntityAttachments.ensureAttachments(entity).push(...attachments);
    EntityAttachments.normalizePersonPhotoFlags(entity);
  }

  function enrichEntity(entity) {
    if (entity.type === 'Location') {
      const lat = entity.attributes.GEO_LAT;
      const lon = entity.attributes.GEO_LON;
      if (typeof lat === 'number' && typeof lon === 'number') {
        entity.geo = { lat, lon };
      }
    }
    if (entity.type === 'Organisation' && entity.attributes.SITZ_OERTLICHKEIT_ID) {
      entity.locationId = entity.attributes.SITZ_OERTLICHKEIT_ID;
    }
    return entity;
  }

  function resetForm() {
    els.typeSelect.value = '';
    renderAttributeFields();
    syncPersonPhotoOptionVisibility();
    els.relationships.innerHTML = '';
    draftRelationships = [];
    draftAttachments = [];
    renderDraftAttachments();
    els.relationshipsEmpty.classList.remove('hidden');
    els.fileInput.value = '';
    els.fileTagInput.value = '';
    els.personPhotoInput.checked = false;
    clearStatus();
  }

  function handleSubmit(event) {
    event.preventDefault();
    clearStatus();

    const typeId = els.typeSelect.value;
    if (!typeId) {
      setStatus('Select an object type before creating the object.', 'error');
      return;
    }

    try {
      const attributes = readAttributeValues();
      if (Object.keys(attributes).length === 0) {
        throw new Error('Enter at least one attribute value.');
      }

      attributes.QUELLSYSTEM = 'Object Explorer';
      attributes.QUELLMODUL = 'Manual Entry';
      attributes.EXTRAKTIONSDATUM = new Date().toISOString().slice(0, 10);

      const entityId = generateEntityId();
      const entity = enrichEntity({
        id: entityId,
        type: typeId,
        attributes,
      });
      readDraftAttachmentsForEntity(entity);
      const newRelations = readRelationships(entity);

      options.entities.push(entity);
      options.lookup.set(entity.id, entity);
      SearchFilters.registerEntityAttributes(options.attributeCatalog, entity);

      for (const relation of newRelations) {
        options.relations.push(relation);
      }

      const name = DisplayNames.displayName(entity, options.lookup);
      setStatus(`Created ${name} (${entity.type}).`, 'success');

      if (typeof options.onCreated === 'function') {
        options.onCreated(entity, newRelations);
      }

      resetForm();
    } catch (error) {
      setStatus(error.message || 'Could not create object.', 'error');
    }
  }

  function init(config) {
    options = config;

    els.form = document.getElementById('new-object-form');
    els.typeSelect = document.getElementById('new-object-type');
    els.attributes = document.getElementById('new-object-attributes');
    els.attributesEmpty = document.getElementById('new-object-attributes-empty');
    els.relationships = document.getElementById('new-object-relationships');
    els.relationshipsEmpty = document.getElementById('new-object-relationships-empty');
    els.fileInput = document.getElementById('new-object-file');
    els.fileTagInput = document.getElementById('new-object-file-tag');
    els.personPhotoWrap = document.getElementById('new-object-person-photo-wrap');
    els.personPhotoInput = document.getElementById('new-object-person-photo');
    els.attachments = document.getElementById('new-object-attachments');
    els.attachmentsEmpty = document.getElementById('new-object-attachments-empty');
    els.attachmentTags = document.getElementById('new-object-attachment-tags');
    els.status = document.getElementById('new-object-status');
    els.labelSuggestions = document.getElementById('new-object-relationship-labels');

    if (!els.form || !els.typeSelect) {
      return;
    }

    els.labelSuggestions.innerHTML = buildRelationshipLabelSuggestions()
      .map((label) => `<option value="${label.replace(/"/g, '&quot;')}"></option>`)
      .join('');

    els.attachmentTags.innerHTML = EntityAttachments.TAG_SUGGESTIONS.map(
      (tag) => `<option value="${tag.replace(/"/g, '&quot;')}"></option>`
    ).join('');

    els.typeSelect.innerHTML =
      '<option value="">Select object type…</option>' +
      options.objectTypes
        .map((type) => `<option value="${type.id}">${type.id}</option>`)
        .join('');

    els.typeSelect.addEventListener('change', () => {
      renderAttributeFields();
      syncPersonPhotoOptionVisibility();
    });
    document.getElementById('btn-add-relationship')?.addEventListener('click', () => createRelationshipRow());
    document.getElementById('btn-add-attachment')?.addEventListener('click', () => {
      handleAddAttachment();
    });
    document.getElementById('btn-reset-new-object')?.addEventListener('click', resetForm);
    els.form.addEventListener('submit', handleSubmit);

    renderAttributeFields();
    syncPersonPhotoOptionVisibility();
    renderDraftAttachments();
  }

  window.NewObjectForm = { init };
})();
