(function () {
  const METADATA_FIELDS = new Set(['QUELLSYSTEM', 'QUELLMODUL', 'QUELLINSTANZ', 'MANDANT', 'EXTRAKTIONSDATUM']);
  const MATCH_VALUE_MAX_LENGTH = 72;

  function readAttr(entity, key) {
    const value = entity.attributes?.[key];
    if (value === null || value === undefined || value === '') {
      return null;
    }
    return String(value).trim();
  }

  function formatFieldLabel(fieldId) {
    return fieldId
      .split('_')
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
      .join(' ');
  }

  function truncateMatchValue(value) {
    if (value.length <= MATCH_VALUE_MAX_LENGTH) {
      return value;
    }
    return `${value.slice(0, MATCH_VALUE_MAX_LENGTH - 1).trimEnd()}…`;
  }

  const NON_DATE_FIELDS = new Set([
    'BAUJAHR',
    'MANDANT',
    'PLZ',
    'HAUSNUMMER',
    'FUNDORT_PLZ',
    'FUNDORT_HAUSNUMMER',
    'STEUER_ID',
  ]);

  function isDateTimeField(fieldId) {
    return /ZEITSTEMPEL|UNFALL_DATUM_ZEIT|TATZEIT_|ENDE_DATUM/.test(fieldId);
  }

  function isDateField(fieldId) {
    if (!fieldId || NON_DATE_FIELDS.has(fieldId)) {
      return false;
    }
    if (/^ANZAHL_/.test(fieldId)) {
      return false;
    }
    if (/^(GEO_|FUNDORT_GEO_)/.test(fieldId)) {
      return false;
    }
    if (/_KG$|_EUR$|_CM$|_KW$|_CCM$|_MONATE$|PUNKTE|SCHADEN|BUSSGELD|GEWICHT|LEISTUNG|HUBRAUM|GESCHOSS|STEUER/.test(fieldId)) {
      return false;
    }
    return (
      isDateTimeField(fieldId) ||
      /(?:DATUM|ERSTZULASSUNG|GEBURTSDATUM|EXTRAKTIONSDATUM|GUELTIG_|_AM$|_SEIT$)/.test(fieldId)
    );
  }

  function parseTimestamp(value) {
    if (value === null || value === undefined || value === '') {
      return null;
    }

    if (typeof value === 'number' && Number.isFinite(value)) {
      const milliseconds = value < 1e12 ? value * 1000 : value;
      const date = new Date(milliseconds);
      return Number.isNaN(date.getTime()) ? null : date;
    }

    const text = String(value).trim();
    if (/^\d{10,13}$/.test(text)) {
      const numeric = Number(text);
      const milliseconds = text.length <= 10 ? numeric * 1000 : numeric;
      const date = new Date(milliseconds);
      return Number.isNaN(date.getTime()) ? null : date;
    }

    const parsed = Date.parse(text);
    if (Number.isNaN(parsed)) {
      return null;
    }
    return new Date(parsed);
  }

  function formatDate(value) {
    const date = parseTimestamp(value);
    if (!date) {
      return value ? String(value) : null;
    }
    return date.toLocaleDateString('de-DE');
  }

  function formatDateTime(value) {
    const date = parseTimestamp(value);
    if (!date) {
      return value ? String(value) : null;
    }
    return date.toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' });
  }

  function formatAttributeValue(value, fieldId) {
    if (value === null || value === undefined || value === '') {
      return '—';
    }

    if (fieldId && isDateField(fieldId)) {
      return isDateTimeField(fieldId) ? formatDateTime(value) : formatDate(value);
    }

    const text = String(value);
    if (/^\d{4}-\d{2}-\d{2}/.test(text)) {
      return text.includes('T') ? formatDateTime(text) : formatDate(text);
    }

    return text;
  }

  const ENTITY_ID_PATTERN = /^[0-9a-f]{4,12}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;

  function isExactEntityIdTerm(term) {
    return ENTITY_ID_PATTERN.test(String(term || '').trim());
  }

  let identityByPersonId = null;
  let identityIndexLookup = null;

  function ensureIdentityByPersonIndex(lookup) {
    if (identityByPersonId && identityIndexLookup === lookup) {
      return identityByPersonId;
    }

    identityByPersonId = new Map();
    identityIndexLookup = lookup;
    for (const entity of lookup.values()) {
      if (entity.type !== 'Identity Record') {
        continue;
      }
      const personId = readAttr(entity, 'PERSON_ID');
      if (personId) {
        identityByPersonId.set(personId, entity);
      }
    }
    return identityByPersonId;
  }

  function identityRecordForPerson(person, lookup) {
    if (!person || person.type !== 'Person' || !lookup) {
      return null;
    }

    const recordId = readAttr(person, 'IDENTITY_RECORD_ID');
    if (recordId && lookup.has(recordId)) {
      return lookup.get(recordId);
    }

    return ensureIdentityByPersonIndex(lookup).get(person.id) ?? null;
  }

  function identityName(entity, lookup) {
    if (entity.type === 'Person') {
      const identity = identityRecordForPerson(entity, lookup);
      if (identity) {
        return displayName(identity, lookup);
      }
      return readAttr(entity, 'ANONYMISIERUNGSSCHLUESSEL');
    }

    const recordId = readAttr(entity, 'IDENTITY_RECORD_ID');
    if (recordId && lookup.has(recordId)) {
      return displayName(lookup.get(recordId), lookup);
    }
    return null;
  }

  function displayName(entity, lookup) {
    switch (entity.type) {
      case 'Location': {
        const label = readAttr(entity, 'BEZEICHNUNG');
        if (label) {
          return label;
        }
        const street = readAttr(entity, 'STRASSE');
        const city = readAttr(entity, 'ORTSNAME');
        if (street && city) {
          return `${street}, ${city}`;
        }
        return entity.id;
      }
      case 'Organisation': {
        const name = readAttr(entity, 'NAME');
        const orgType = readAttr(entity, 'ORGANISATIONSTYP');
        if (name && orgType) {
          return `${name} — ${orgType}`;
        }
        return name || entity.id;
      }
      case 'Identity Record': {
        const first = readAttr(entity, 'VORNAME');
        const last = readAttr(entity, 'NACHNAME');
        const full = [first, last].filter(Boolean).join(' ');
        return full || entity.id;
      }
      case 'Person':
        return identityName(entity, lookup) || entity.id;
      case 'Case File': {
        const fileNo = readAttr(entity, 'AKTENZEICHEN');
        const title = readAttr(entity, 'TITEL');
        if (fileNo && title) {
          return `${fileNo} — ${title}`;
        }
        return fileNo || title || entity.id;
      }
      case 'Criminal Offence': {
        const type = readAttr(entity, 'DELIKTART');
        const paragraph = readAttr(entity, 'PARAGRAF');
        const when = formatDate(readAttr(entity, 'TATZEIT_VON'));
        if (type && paragraph && when) {
          return `${type} — ${paragraph} — ${when}`;
        }
        if (type && paragraph) {
          return `${type} — ${paragraph}`;
        }
        return type || entity.id;
      }
      case 'Regulatory Offence': {
        const type = readAttr(entity, 'OWI_TYP');
        const paragraph = readAttr(entity, 'PARAGRAF');
        const when = formatDate(readAttr(entity, 'TATZEIT_VON'));
        if (type && paragraph && when) {
          return `${type} — ${paragraph} — ${when}`;
        }
        if (type && paragraph) {
          return `${type} — ${paragraph}`;
        }
        return type || entity.id;
      }
      case 'Traffic Accident': {
        const type = readAttr(entity, 'UNFALLART');
        const when = formatDateTime(readAttr(entity, 'UNFALL_DATUM_ZEIT'));
        const category = readAttr(entity, 'UNFALLKATEGORIE');
        if (type && when && category) {
          return `${type} — ${when} — ${category}`;
        }
        if (type && when) {
          return `${type} — ${when}`;
        }
        return type || entity.id;
      }
      case 'Motor Vehicle': {
        const plate = readAttr(entity, 'KENNZEICHEN');
        const make = readAttr(entity, 'MARKE');
        const model = readAttr(entity, 'MODELL');
        if (plate && make && model) {
          return `${plate} — ${make} ${model}`;
        }
        return plate || entity.id;
      }
      case 'Firearm': {
        const weaponType = readAttr(entity, 'WAFFENTYP');
        const serial = readAttr(entity, 'SERIENNUMMER');
        const weaponNo = readAttr(entity, 'WAFFENNUMMER');
        if (weaponType && serial) {
          return `${weaponType} — SN ${serial}`;
        }
        if (weaponType && weaponNo) {
          return `${weaponType} — WNr ${weaponNo}`;
        }
        return weaponType || entity.id;
      }
      case 'Police Measure': {
        const measure = readAttr(entity, 'MASSNAHME_TYP');
        const legal = readAttr(entity, 'RECHTSGRUNDLAGE');
        const start = formatDate(readAttr(entity, 'BEGINN_DATUM'));
        if (measure && legal) {
          return `${measure} — ${legal}`;
        }
        if (measure && start) {
          return `${measure} — ${start}`;
        }
        return measure || entity.id;
      }
      case 'Documents': {
        const number = readAttr(entity, 'URKUNDENNUMMER');
        const docType = readAttr(entity, 'URKUNDENTYP');
        const foundAt = readAttr(entity, 'FUNDORT_BEZEICHNUNG');
        if (number && docType) {
          return `${number} — ${docType}`;
        }
        if (docType && foundAt) {
          return `${docType} — ${foundAt}`;
        }
        return number || docType || entity.id;
      }
      case 'Tip and Lead': {
        const category = readAttr(entity, 'KATEGORIE');
        const received = formatDate(readAttr(entity, 'EINGANGSDATUM'));
        const channel = readAttr(entity, 'EINGANGSWEG');
        if (category && received) {
          return `${category} — ${received}`;
        }
        if (category) {
          return category;
        }
        if (received && channel) {
          return `${received} — ${channel}`;
        }
        return received || channel || entity.id;
      }
      case 'Physical Description': {
        const personId = readAttr(entity, 'PERSON_ID');
        const person = personId ? lookup.get(personId) : null;
        const identity = person ? identityRecordForPerson(person, lookup) : null;
        const name = identity ? displayName(identity, lookup) : person ? displayName(person, lookup) : null;
        const trait = readAttr(entity, 'DISTINKTIVE_MERKMALE') || readAttr(entity, 'KLEIDUNG_TYP');
        if (name && trait) {
          return `${name} — ${trait}`;
        }
        return name || trait || entity.id;
      }
      case 'Case Event': {
        const activity = readAttr(entity, 'AKTIVITAET');
        const when = formatDateTime(readAttr(entity, 'ZEITSTEMPEL'));
        const detail = readAttr(entity, 'DETAIL');
        if (activity && when && detail) {
          return `${activity} — ${when} — ${detail}`;
        }
        if (activity && when) {
          return `${activity} — ${when}`;
        }
        return activity || entity.id;
      }
      default:
        return entity.id;
    }
  }

  /**
   * Match attribute values on the entity. Person objects also match linked identity names.
   */
  function resolveMatch(entity, term, options = {}) {
    const trimmed = term.trim();
    const normalized = trimmed.toLowerCase();
    if (!normalized) {
      return null;
    }

    if (isExactEntityIdTerm(trimmed)) {
      if (entity.id.toLowerCase() !== normalized) {
        return null;
      }
      return {
        fieldId: 'ID',
        fieldLabel: 'ID',
        value: entity.id,
        priority: -2,
      };
    }

    const allowedFields = options.allowedFields || null;
    const lookup = options.lookup || null;
    const candidates = [];

    for (const [fieldId, rawValue] of Object.entries(entity.attributes || {})) {
      if (METADATA_FIELDS.has(fieldId)) {
        continue;
      }
      if (allowedFields && !allowedFields.has(fieldId)) {
        continue;
      }

      const fieldLabel = formatFieldLabel(fieldId);
      const value = rawValue === null || rawValue === undefined ? '' : String(rawValue).trim();
      if (!value || !value.toLowerCase().includes(normalized)) {
        continue;
      }

      candidates.push({
        fieldId,
        fieldLabel,
        value: truncateMatchValue(formatAttributeValue(rawValue, fieldId)),
        priority: 0,
      });
    }

    if ((!allowedFields || allowedFields.has('ID')) && entity.id.toLowerCase().includes(normalized)) {
      candidates.push({
        fieldId: 'ID',
        fieldLabel: 'ID',
        value: entity.id,
        priority: 0,
      });
    }

    if (entity.type === 'Person' && lookup) {
      const identity = identityRecordForPerson(entity, lookup);
      if (identity) {
        const identityMatch = resolveMatch(identity, term, options);
        if (identityMatch) {
          candidates.push({
            ...identityMatch,
            priority: identityMatch.priority ?? 0,
          });
        }
      }

      const name = displayName(entity, lookup);
      if (name && name.toLowerCase().includes(normalized)) {
        candidates.push({
          fieldId: 'NAME',
          fieldLabel: 'Name',
          value: truncateMatchValue(name),
          priority: -1,
        });
      }
    }

    if (candidates.length === 0) {
      return null;
    }

    candidates.sort((a, b) => a.priority - b.priority || a.fieldLabel.localeCompare(b.fieldLabel));
    return candidates[0];
  }

  function entityMatchesSearch(entity, term, options = {}) {
    const trimmed = term.trim();
    if (isExactEntityIdTerm(trimmed)) {
      return entity.id.toLowerCase() === trimmed.toLowerCase();
    }
    return resolveMatch(entity, term, options) !== null;
  }

  function formatEntityTooltip(entity, lookup) {
    return `${displayName(entity, lookup)} · ${entity.type}`;
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function formatObjectTooltipHtml(name, type) {
    return `<div class="map-pin-tooltip"><strong>${escapeHtml(name)}</strong><span>${escapeHtml(type)}</span></div>`;
  }

  function formatMapPinTooltipHtml(pin) {
    const lookup = window.INVESTIGATION_MOCK?.entities
      ? new Map(window.INVESTIGATION_MOCK.entities.map((entity) => [entity.id, entity]))
      : null;
    const name = lookup ? displayName(pin.sourceEntity, lookup) : pin.sourceEntity.id;
    return formatObjectTooltipHtml(`${name} · ${pin.label}`, pin.sourceEntity.type);
  }

  function formatMapPinTooltip(pin) {
    const lookup = window.INVESTIGATION_MOCK?.entities
      ? new Map(window.INVESTIGATION_MOCK.entities.map((entity) => [entity.id, entity]))
      : null;
    const name = lookup ? displayName(pin.sourceEntity, lookup) : pin.sourceEntity.id;
    return `${name} · ${pin.label}\n${pin.sourceEntity.type}`;
  }

  window.DisplayNames = {
    displayName,
    formatAttributeValue,
    formatDate,
    formatDateTime,
    formatEntityTooltip,
    formatMapPinTooltip,
    formatMapPinTooltipHtml,
    formatObjectTooltipHtml,
    parseTimestamp,
    resolveMatch,
    entityMatchesSearch,
    formatFieldLabel,
  };
})();
