(function () {
  const TAG_SUGGESTIONS = [
    'Mugshot',
    'Person photo',
    'Evidence photo',
    'Scene photo',
    'Surveillance still',
    'ID document',
    'Report',
    'Witness statement',
    'Vehicle photo',
    'Map sketch',
    'Seizure record',
    'Other',
  ];

  let attachmentCounter = 1000;

  function svgDataUrl(svg) {
    return `data:image/svg+xml,${encodeURIComponent(svg)}`;
  }

  function personPhotoPlaceholder(initials, accent = '#1b44b1', background = '#dbeafe') {
    return svgDataUrl(`<svg xmlns="http://www.w3.org/2000/svg" width="240" height="300" viewBox="0 0 240 300">
      <rect width="240" height="300" rx="16" fill="${background}"/>
      <circle cx="120" cy="92" r="50" fill="${accent}" opacity="0.88"/>
      <ellipse cx="120" cy="236" rx="72" ry="58" fill="${accent}" opacity="0.88"/>
      <text x="120" y="286" text-anchor="middle" font-family="system-ui,sans-serif" font-size="13" font-weight="600" fill="#334e68">${initials}</text>
    </svg>`);
  }

  function documentPlaceholder(title, subtitle, accent = '#5c7080') {
    const safeTitle = title.replace(/[<>&"]/g, '');
    const safeSubtitle = subtitle.replace(/[<>&"]/g, '');
    return svgDataUrl(`<svg xmlns="http://www.w3.org/2000/svg" width="320" height="420" viewBox="0 0 320 420">
      <rect width="320" height="420" rx="14" fill="#f8fafc"/>
      <rect x="24" y="24" width="272" height="372" rx="10" fill="#ffffff" stroke="${accent}" stroke-width="2"/>
      <rect x="48" y="56" width="120" height="12" rx="6" fill="${accent}" opacity="0.35"/>
      <rect x="48" y="84" width="224" height="10" rx="5" fill="#cbd5e1"/>
      <rect x="48" y="106" width="204" height="10" rx="5" fill="#cbd5e1"/>
      <rect x="48" y="128" width="188" height="10" rx="5" fill="#cbd5e1"/>
      <text x="48" y="190" font-family="system-ui,sans-serif" font-size="18" font-weight="700" fill="#102a43">${safeTitle}</text>
      <text x="48" y="218" font-family="system-ui,sans-serif" font-size="13" fill="#627d98">${safeSubtitle}</text>
      <text x="48" y="360" font-family="system-ui,sans-serif" font-size="12" fill="${accent}">PDF document</text>
    </svg>`);
  }

  function imagePlaceholder(title, accent = '#0f9960') {
    const safeTitle = title.replace(/[<>&"]/g, '');
    return svgDataUrl(`<svg xmlns="http://www.w3.org/2000/svg" width="320" height="220" viewBox="0 0 320 220">
      <defs>
        <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="${accent}" stop-opacity="0.18"/>
          <stop offset="100%" stop-color="${accent}" stop-opacity="0.42"/>
        </linearGradient>
      </defs>
      <rect width="320" height="220" rx="14" fill="url(#bg)"/>
      <circle cx="118" cy="92" r="24" fill="#ffffff" opacity="0.85"/>
      <path d="M108 98l14-16 18 20 12-10 20 24H84Z" fill="${accent}" opacity="0.75"/>
      <text x="16" y="204" font-family="system-ui,sans-serif" font-size="13" font-weight="600" fill="#243b53">${safeTitle}</text>
    </svg>`);
  }

  function ensureAttachments(entity) {
    if (!entity.attachments) {
      entity.attachments = [];
    }
    return entity.attachments;
  }

  function generateAttachmentId() {
    attachmentCounter += 1;
    return `att-${String(attachmentCounter).padStart(6, '0')}`;
  }

  function kindFromMime(mimeType = '') {
    if (mimeType.startsWith('image/')) {
      return 'image';
    }
    return 'document';
  }

  function createAttachment(payload) {
    const mimeType = payload.mimeType || 'application/octet-stream';
    return {
      id: payload.id || generateAttachmentId(),
      fileName: payload.fileName || 'upload.bin',
      mimeType,
      kind: payload.kind || kindFromMime(mimeType),
      tag: payload.tag || 'Other',
      url: payload.url,
      isPersonPhoto: Boolean(payload.isPersonPhoto),
      uploadedAt: payload.uploadedAt || new Date().toISOString().slice(0, 10),
    };
  }

  function normalizePersonPhotoFlags(entity) {
    if (entity.type !== 'Person') {
      for (const attachment of ensureAttachments(entity)) {
        attachment.isPersonPhoto = false;
      }
      return;
    }

    let personPhoto = null;
    for (const attachment of ensureAttachments(entity)) {
      if (attachment.isPersonPhoto && attachment.kind === 'image') {
        if (!personPhoto) {
          personPhoto = attachment;
        } else {
          attachment.isPersonPhoto = false;
        }
      } else {
        attachment.isPersonPhoto = false;
      }
    }
  }

  function getPersonPhoto(entity) {
    if (!entity || entity.type !== 'Person') {
      return null;
    }
    return ensureAttachments(entity).find((attachment) => attachment.isPersonPhoto && attachment.kind === 'image') || null;
  }

  function readFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(new Error(`Could not read ${file.name}.`));
      reader.readAsDataURL(file);
    });
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function renderPersonPhoto(photoEl, iconEl, entity) {
    if (!photoEl) {
      return;
    }

    const photo = getPersonPhoto(entity);
    if (entity?.type === 'Person' && photo?.url) {
      photoEl.innerHTML = `<img src="${photo.url}" alt="${escapeHtml(photo.tag || 'Person photo')}" />`;
      photoEl.classList.remove('hidden');
      photoEl.setAttribute('aria-hidden', 'false');
      iconEl?.classList.add('hidden');
      return;
    }

    photoEl.innerHTML = '';
    photoEl.classList.add('hidden');
    photoEl.setAttribute('aria-hidden', 'true');
    iconEl?.classList.remove('hidden');
  }

  function renderDocumentList(container, emptyEl, entity) {
    if (!container) {
      return;
    }

    const attachments = ensureAttachments(entity);
    container.innerHTML = '';

    if (attachments.length === 0) {
      emptyEl?.classList.remove('hidden');
      return;
    }

    emptyEl?.classList.add('hidden');

    for (const attachment of attachments) {
      const card = document.createElement('article');
      card.className = 'instance-attachment';

      const preview = document.createElement('div');
      preview.className = 'instance-attachment__preview';

      if (attachment.kind === 'image' && attachment.url) {
        preview.innerHTML = `<img src="${attachment.url}" alt="${escapeHtml(attachment.tag)}" loading="lazy" />`;
      } else {
        preview.innerHTML = `
          <div class="instance-attachment__doc-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6">
              <path d="M8 4h8l3 3v13H8V4z" stroke-linejoin="round"/>
              <path d="M16 4v3h3M8 9h8M8 12h6" stroke-linecap="round"/>
            </svg>
          </div>
        `;
      }

      const body = document.createElement('div');
      body.className = 'instance-attachment__body';
      body.innerHTML = `
        <div class="instance-attachment__tag">${escapeHtml(attachment.tag)}${attachment.isPersonPhoto ? ' <span class="instance-attachment__badge">Person photo</span>' : ''}</div>
        <div class="instance-attachment__file">${escapeHtml(attachment.fileName)}</div>
        <div class="instance-attachment__meta">${escapeHtml(attachment.mimeType)} · ${escapeHtml(attachment.uploadedAt || '')}</div>
      `;

      const actions = document.createElement('div');
      actions.className = 'instance-attachment__actions';
      if (attachment.url) {
        const link = document.createElement('a');
        link.className = 'instance-attachment__link';
        link.href = attachment.url;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        link.textContent = attachment.kind === 'image' ? 'View image' : 'Open file';
        actions.appendChild(link);
      }

      card.appendChild(preview);
      card.appendChild(body);
      card.appendChild(actions);
      container.appendChild(card);
    }
  }

  window.EntityAttachments = {
    TAG_SUGGESTIONS,
    ensureAttachments,
    generateAttachmentId,
    kindFromMime,
    createAttachment,
    normalizePersonPhotoFlags,
    getPersonPhoto,
    readFileAsDataUrl,
    personPhotoPlaceholder,
    documentPlaceholder,
    imagePlaceholder,
    renderPersonPhoto,
    renderDocumentList,
  };
})();
