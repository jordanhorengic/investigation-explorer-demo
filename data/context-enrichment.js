(function () {
  const mock = window.INVESTIGATION_MOCK;
  const EA = window.EntityAttachments;
  if (!mock || !EA) {
    return;
  }

  const byId = new Map(mock.entities.map((entity) => [entity.id, entity]));
  const identityByPerson = new Map();

  for (const entity of mock.entities) {
    if (entity.type !== 'Identity Record') {
      continue;
    }
    const personId = entity.attributes?.PERSON_ID;
    if (personId) {
      identityByPerson.set(String(personId), entity);
    }
  }

  const DEMO = {
    rothPerson: 'bbbb-0145-0000-0000-bbbbbbbbbbbb',
    beckerPerson: 'bbbb-0005-0000-0000-bbbbbbbbbbbb',
    case0078: 'aaaa-0004-0000-0000-aaaaaaaaaaaa',
    hellsWolves: 'jjjj-0008-0000-0000-jjjjjjjjjjjj',
    sendlingerTor: 'dddd-0006-0000-0000-dddddddddddd',
    beckerHome: 'dddd-0004-0000-0000-dddddddddddd',
    implerPark: 'dddd-0048-0000-0000-dddddddddddd',
    karlsplatz: 'dddd-0010-0000-0000-dddddddddddd',
  };

  const PORTRAIT_OVERRIDES = {
    [DEMO.rothPerson]:
      'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?auto=format&fit=crop&w=240&h=300&q=80',
    [DEMO.beckerPerson]:
      'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=240&h=300&q=80',
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
    const identity = identityByPerson.get(entity.id);
    const slug =
      identity?.attributes?.NACHNAME ||
      entity.attributes?.ANONYMISIERUNGSSCHLUESSEL ||
      entity.id.slice(-6);
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

  function ensurePersonLocation(personId, label, locationId, relationshipType) {
    const person = byId.get(personId);
    const location = byId.get(locationId);
    if (!person || !location) {
      return;
    }

    if (!person.personLocations) {
      person.personLocations = [];
    }
    if (!person.personLocations.some((entry) => entry.locationId === locationId && entry.label === label)) {
      person.personLocations.push({ label, locationId });
    }

    const relationKey = `${personId}|${locationId}|${relationshipType}|${label}`;
    const exists = mock.relations.some(
      (relation) =>
        relation.from === personId &&
        relation.to === locationId &&
        relation.role === label &&
        relation.relationshipType === relationshipType,
    );
    if (!exists) {
      mock.relations.push({
        from: personId,
        to: locationId,
        label: `${person.type} ${label}`,
        relationshipType,
        kind: 'location',
        role: label,
      });
    }
  }

  function ensureOrganisationSeat(orgId, locationId) {
    const org = byId.get(orgId);
    if (!org) {
      return;
    }
    org.locationId = locationId;
    org.attributes = org.attributes || {};
    if (!org.attributes.SITZ_OERTLICHKEIT_ID) {
      org.attributes.SITZ_OERTLICHKEIT_ID = locationId;
    }
    const exists = mock.relations.some((relation) => relation.from === orgId && relation.to === locationId);
    if (!exists) {
      mock.relations.push({
        from: orgId,
        to: locationId,
        label: 'Organisation SITZ_OERTLICHKEIT_ID',
        relationshipType: 'Organisation_Sitz_Oertlichkeit',
        kind: 'location',
        role: 'Headquarter',
      });
    }
  }

  function attachDocumentRecord(documentEntity) {
    const attrs = documentEntity.attributes || {};
    const docType = attrs.URKUNDENTYP;
    const docNumber = attrs.URKUNDENNUMMER;
    if (!docType && !docNumber) {
      return;
    }

    const title = docNumber ? `${docNumber} — ${docType || 'Document'}` : docType;
    const fileStem = String(docNumber || docType || documentEntity.id.slice(-8))
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_');

    attach(documentEntity.id, {
      fileName: `${fileStem}.pdf`,
      mimeType: 'application/pdf',
      tag: docType || 'ID document',
      uploadedAt: attrs.SICHERSTELLUNG_DATUM || attrs.AUSSTELLUNGSDATUM || null,
      url: EA.documentPlaceholder(title, attrs.AUSSTELLENDE_STELLE || 'Polizeidokument', '#5c7080'),
    });

    const identityId = attrs.AUSGESTELLT_AUF_PERSONALIE_ID;
    if (!identityId) {
      return;
    }

    const identity = byId.get(String(identityId));
    const personId = identity?.attributes?.PERSON_ID;
    if (!personId) {
      return;
    }

    attach(String(personId), {
      fileName: `${fileStem}_copy.pdf`,
      mimeType: 'application/pdf',
      tag: docType || 'ID document',
      uploadedAt: attrs.SICHERSTELLUNG_DATUM || attrs.AUSSTELLUNGSDATUM || null,
      url: EA.documentPlaceholder(title, 'Linked from document record', '#5c7080'),
    });
  }

  ensurePersonLocation(DEMO.rothPerson, 'Home', DEMO.karlsplatz, 'Person_Wohnsitz_Oertlichkeit');
  ensurePersonLocation(DEMO.beckerPerson, 'Home', DEMO.beckerHome, 'Person_Wohnsitz_Oertlichkeit');
  ensureOrganisationSeat(DEMO.hellsWolves, DEMO.implerPark);

  attach(DEMO.rothPerson, {
    fileName: 'roth_mugshot.jpg',
    mimeType: 'image/jpeg',
    tag: 'Mugshot',
    isPersonPhoto: true,
    uploadedAt: '2026-03-14',
    url: portraitForPerson(byId.get(DEMO.rothPerson)),
  });
  attach(DEMO.rothPerson, {
    fileName: 'clubhouse_surveillance.png',
    mimeType: 'image/png',
    tag: 'Surveillance still',
    uploadedAt: '2026-05-18',
    url: EA.imagePlaceholder('Clubhouse entrance · 22:14', '#634dbf'),
  });
  attach(DEMO.rothPerson, {
    fileName: 'membership_record.pdf',
    mimeType: 'application/pdf',
    tag: 'Seizure record',
    uploadedAt: '2026-04-02',
    url: EA.documentPlaceholder('Membership ledger excerpt', 'Hells Wolves MC München', '#8f398f'),
  });

  attach(DEMO.beckerPerson, {
    fileName: 'becker_mugshot.jpg',
    mimeType: 'image/jpeg',
    tag: 'Mugshot',
    isPersonPhoto: true,
    uploadedAt: '2026-02-08',
    url: portraitForPerson(byId.get(DEMO.beckerPerson)),
  });
  attach(DEMO.beckerPerson, {
    fileName: 'vehicle_registration.pdf',
    mimeType: 'application/pdf',
    tag: 'ID document',
    uploadedAt: '2026-01-22',
    url: EA.documentPlaceholder('Vehicle registration', 'M-AB 1234 · VW Golf 7', '#106ba3'),
  });

  attach(DEMO.case0078, {
    fileName: 'case_summary_vg-2026-0078.pdf',
    mimeType: 'application/pdf',
    tag: 'Report',
    uploadedAt: '2026-02-01',
    url: EA.documentPlaceholder('Case summary', 'VG-2026-0078 · Betäubungsmittelhandel', '#d9822b'),
  });
  attach(DEMO.case0078, {
    fileName: 'sendlinger_tor_cctv.jpg',
    mimeType: 'image/jpeg',
    tag: 'Surveillance still',
    uploadedAt: '2026-02-14',
    url: EA.imagePlaceholder('Sendlinger Tor · CCTV still', '#c23030'),
  });

  attach(DEMO.hellsWolves, {
    fileName: 'clubhouse_exterior.jpg',
    mimeType: 'image/jpeg',
    tag: 'Scene photo',
    uploadedAt: '2026-04-11',
    url: EA.imagePlaceholder('Hells Wolves clubhouse · Implerstraße', '#8f398f'),
  });

  for (const entity of mock.entities) {
    if (entity.type === 'Documents') {
      attachDocumentRecord(entity);
    }
  }

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
