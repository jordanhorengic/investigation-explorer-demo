(function () {
  const mock = window.INVESTIGATION_MOCK;
  const EA = window.EntityAttachments;
  if (!mock || !EA) {
    return;
  }

  const byId = new Map(mock.entities.map((entity) => [entity.id, entity]));

  const PORTRAIT_OVERRIDES = {
    'a1b2c3d4-0000-0000-0000-000000000021':
      'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?auto=format&fit=crop&w=240&h=300&q=80',
    'a1b2c3d4-0000-0000-0000-000000000022':
      'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=240&h=300&q=80',
    'a1b2c3d4-0000-0000-0000-000000000023':
      'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?auto=format&fit=crop&w=240&h=300&q=80',
    'a1b2c3d4-0000-0000-0000-000000000024':
      'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?auto=format&fit=crop&w=240&h=300&q=80',
  };

  function portraitForPerson(entity) {
    if (PORTRAIT_OVERRIDES[entity.id]) {
      return PORTRAIT_OVERRIDES[entity.id];
    }

    const numeric = Number.parseInt(entity.id.replace(/\D/g, '').slice(-6), 10) || 0;
    const portraitIndex = (numeric % 70) + 1;
    const gender = numeric % 3 === 0 ? 'women' : 'men';
    return `https://randomuser.me/api/portraits/${gender}/${portraitIndex}.jpg`;
  }

  function personPhotoFileName(entity) {
    const slug = entity.attributes?.ANONYMISIERUNGSSCHLUESSEL || entity.id.slice(-6);
    return `${String(slug).toLowerCase().replace(/[^a-z0-9]+/g, '_')}_photo.jpg`;
  }

  function attach(entityId, attachment) {
    const entity = byId.get(entityId);
    if (!entity) {
      return;
    }
    EA.ensureAttachments(entity).push(EA.createAttachment(attachment));
    EA.normalizePersonPhotoFlags(entity);
  }

  attach('a1b2c3d4-0000-0000-0000-000000000021', {
    fileName: 'roth_mugshot.jpg',
    mimeType: 'image/jpeg',
    tag: 'Mugshot',
    isPersonPhoto: true,
    uploadedAt: '2026-03-14',
    url: portraitForPerson(byId.get('a1b2c3d4-0000-0000-0000-000000000021')),
  });
  attach('a1b2c3d4-0000-0000-0000-000000000021', {
    fileName: 'clubhouse_surveillance.png',
    mimeType: 'image/png',
    tag: 'Surveillance still',
    uploadedAt: '2026-05-18',
    url: EA.imagePlaceholder('Clubhouse entrance · 22:14', '#634dbf'),
  });
  attach('a1b2c3d4-0000-0000-0000-000000000021', {
    fileName: 'membership_record.pdf',
    mimeType: 'application/pdf',
    tag: 'Seizure record',
    uploadedAt: '2026-04-02',
    url: EA.documentPlaceholder('Membership ledger excerpt', 'Hells Wolves MC München', '#8f398f'),
  });

  attach('a1b2c3d4-0000-0000-0000-000000000022', {
    fileName: 'becker_mugshot.jpg',
    mimeType: 'image/jpeg',
    tag: 'Mugshot',
    isPersonPhoto: true,
    uploadedAt: '2026-02-08',
    url: portraitForPerson(byId.get('a1b2c3d4-0000-0000-0000-000000000022')),
  });
  attach('a1b2c3d4-0000-0000-0000-000000000022', {
    fileName: 'vehicle_registration.pdf',
    mimeType: 'application/pdf',
    tag: 'ID document',
    uploadedAt: '2026-02-09',
    url: EA.documentPlaceholder('Vehicle registration copy', 'BMW R 1250 GS · M-BE 221', '#106ba3'),
  });

  attach('a1b2c3d4-0000-0000-0000-000000000023', {
    fileName: 'vogel_reference.jpg',
    mimeType: 'image/jpeg',
    tag: 'Person photo',
    isPersonPhoto: true,
    uploadedAt: '2026-05-30',
    url: portraitForPerson(byId.get('a1b2c3d4-0000-0000-0000-000000000023')),
  });
  attach('a1b2c3d4-0000-0000-0000-000000000023', {
    fileName: 'witness_statement.pdf',
    mimeType: 'application/pdf',
    tag: 'Witness statement',
    uploadedAt: '2026-05-31',
    url: EA.documentPlaceholder('Witness interview transcript', 'VG-2026-0078 · Eva Vogel', '#d9822b'),
  });

  attach('a1b2c3d4-0000-0000-0000-000000000024', {
    fileName: 'keller_mugshot.jpg',
    mimeType: 'image/jpeg',
    tag: 'Mugshot',
    isPersonPhoto: true,
    uploadedAt: '2026-04-21',
    url: portraitForPerson(byId.get('a1b2c3d4-0000-0000-0000-000000000024')),
  });

  attach('a1b2c3d4-0000-0000-0000-000000000010', {
    fileName: 'clubhouse_floorplan.pdf',
    mimeType: 'application/pdf',
    tag: 'Map sketch',
    uploadedAt: '2026-03-20',
    url: EA.documentPlaceholder('Clubhouse floor plan', 'Arnulfstraße 42', '#8f398f'),
  });
  attach('a1b2c3d4-0000-0000-0000-000000000010', {
    fileName: 'club_logo.jpg',
    mimeType: 'image/jpeg',
    tag: 'Evidence photo',
    uploadedAt: '2026-03-20',
    url: EA.imagePlaceholder('Patch seized during search', '#8f398f'),
  });

  attach('a1b2c3d4-0000-0000-0000-000000000020', {
    fileName: 'case_summary.pdf',
    mimeType: 'application/pdf',
    tag: 'Report',
    uploadedAt: '2026-06-01',
    url: EA.documentPlaceholder('Investigation summary', 'VG-2026-0078 · Einbruch Serie', '#d9822b'),
  });
  attach('a1b2c3d4-0000-0000-0000-000000000020', {
    fileName: 'scene_overview.jpg',
    mimeType: 'image/jpeg',
    tag: 'Scene photo',
    uploadedAt: '2026-05-12',
    url: EA.imagePlaceholder('Bahnhofstraße 78 · forced entry', '#c23030'),
  });
  attach('a1b2c3d4-0000-0000-0000-000000000020', {
    fileName: 'tool_marks.jpg',
    mimeType: 'image/jpeg',
    tag: 'Evidence photo',
    uploadedAt: '2026-05-12',
    url: EA.imagePlaceholder('Tool marks on rear door', '#a66321'),
  });

  attach('a1b2c3d4-0000-0000-0000-000000000030', {
    fileName: 'offence_report.pdf',
    mimeType: 'application/pdf',
    tag: 'Report',
    uploadedAt: '2026-05-15',
    url: EA.documentPlaceholder('Offence notification', 'Einbruchsdiebstahl · Bahnhofstraße', '#c23030'),
  });
  attach('a1b2c3d4-0000-0000-0000-000000000030', {
    fileName: 'fingerprint_lift.jpg',
    mimeType: 'image/jpeg',
    tag: 'Evidence photo',
    uploadedAt: '2026-05-15',
    url: EA.imagePlaceholder('Latent print · glass display case', '#634dbf'),
  });

  attach('a1b2c3d4-0000-0000-0000-000000000040', {
    fileName: 'accident_sketch.pdf',
    mimeType: 'application/pdf',
    tag: 'Map sketch',
    uploadedAt: '2026-04-08',
    url: EA.documentPlaceholder('Accident scene sketch', 'Leopoldstraße / Nordend', '#a66321'),
  });
  attach('a1b2c3d4-0000-0000-0000-000000000040', {
    fileName: 'damage_front.jpg',
    mimeType: 'image/jpeg',
    tag: 'Vehicle photo',
    uploadedAt: '2026-04-08',
    url: EA.imagePlaceholder('Front-end damage · Audi A4', '#106ba3'),
  });

  attach('a1b2c3d4-0000-0000-0000-000000000080', {
    fileName: 'scan_id_card.jpg',
    mimeType: 'image/jpeg',
    tag: 'ID document',
    uploadedAt: '2026-05-03',
    url: EA.imagePlaceholder('Recovered ID card scan', '#5c7080'),
  });
  attach('a1b2c3d4-0000-0000-0000-000000000081', {
    fileName: 'vehicle_title.pdf',
    mimeType: 'application/pdf',
    tag: 'ID document',
    uploadedAt: '2026-05-19',
    url: EA.documentPlaceholder('Vehicle title copy', 'UR-2026-0118', '#5c7080'),
  });
  attach('a1b2c3d4-0000-0000-0000-000000000082', {
    fileName: 'cctv_still.jpg',
    mimeType: 'image/jpeg',
    tag: 'Surveillance still',
    uploadedAt: '2026-05-28',
    url: EA.imagePlaceholder('CCTV still · Bahnhofstraße 78', '#5c7080'),
  });

  for (const entity of mock.entities) {
    if (entity.type !== 'Person') {
      continue;
    }

    const attachments = EA.ensureAttachments(entity);
    if (attachments.some((item) => item.isPersonPhoto)) {
      continue;
    }

    attach(entity.id, {
      fileName: personPhotoFileName(entity),
      mimeType: 'image/jpeg',
      tag: 'Person photo',
      isPersonPhoto: true,
      uploadedAt: '2026-01-15',
      url: portraitForPerson(entity),
    });
  }
})();
