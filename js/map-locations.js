(function () {
  const PERSON_ADDRESS_ROLES = ['Home', 'Work', 'Whereabouts'];

  const GEO_AREAS = [
    {
      id: 'munich',
      names: ['münchen', 'munich', 'muenchen'],
      label: 'München',
      bounds: [
        [48.06, 11.36],
        [48.22, 11.72],
      ],
    },
  ];

  function readAttr(entity, key) {
    const value = entity?.attributes?.[key];
    if (value === null || value === undefined || value === '') {
      return null;
    }
    return String(value).trim();
  }

  function displayName(entity, lookup) {
    return window.DisplayNames.displayName(entity, lookup);
  }

  function formatPinLabel(name, suffix) {
    if (!suffix || suffix === name) {
      return name;
    }
    return `${name} - ${suffix}`;
  }

  function getGeo(entity) {
    if (entity?.geo?.lat && entity?.geo?.lon) {
      return { lat: entity.geo.lat, lon: entity.geo.lon };
    }

    const lat = readAttr(entity, 'GEO_LAT') || readAttr(entity, 'FUNDORT_GEO_LAT');
    const lon = readAttr(entity, 'GEO_LON') || readAttr(entity, 'FUNDORT_GEO_LON');
    if (lat && lon) {
      return { lat: Number.parseFloat(lat), lon: Number.parseFloat(lon) };
    }

    return null;
  }

  function getReferenceDate(entity) {
    const attrs = entity.attributes || {};
    return (
      attrs.TATZEIT_VON ||
      attrs.UNFALL_DATUM_ZEIT ||
      attrs.EINGANGSDATUM ||
      attrs.ZEITSTEMPEL ||
      attrs.BEGINN_DATUM ||
      attrs.EROEFFNET_AM ||
      null
    );
  }

  function passesTimeFilter(entity, timePeriod) {
    if (!timePeriod || timePeriod === 'all') {
      return true;
    }

    const alwaysInclude = new Set(['Person', 'Organisation', 'Location', 'Identity Record', 'Physical Description']);
    if (alwaysInclude.has(entity.type)) {
      return true;
    }

    const dateValue = getReferenceDate(entity);
    if (!dateValue) {
      return false;
    }

    const parsed = Date.parse(dateValue);
    if (Number.isNaN(parsed)) {
      return false;
    }

    const monthsByPeriod = {
      '1m': 1,
      '3m': 3,
      '6m': 6,
      '12m': 12,
      '24m': 24,
      '36m': 36,
      '5y': 60,
    };
    const months = monthsByPeriod[timePeriod] ?? null;
    if (!months) {
      return true;
    }

    const cutoff = new Date();
    cutoff.setMonth(cutoff.getMonth() - months);
    return parsed >= cutoff.getTime();
  }

  function passesFilters(entity, filters = {}, rootEntity = null, lookup = null, relations = null) {
    if (filters.typeFilters instanceof Set && filters.typeFilters.size > 0) {
      if (!filters.typeFilters.has(entity.type)) {
        return false;
      }
    } else if (filters.typeFilter && filters.typeFilter !== 'all' && entity.type !== filters.typeFilter) {
      return false;
    }
    if (!passesTimeFilter(entity, filters.timePeriod)) {
      return false;
    }
    if (rootEntity && lookup && relations) {
      return entityWithinDistance(rootEntity, entity, filters, lookup, relations);
    }
    return true;
  }

  function haversineMeters(a, b) {
    const earthRadius = 6371000;
    const toRadians = (degrees) => (degrees * Math.PI) / 180;
    const dLat = toRadians(b.lat - a.lat);
    const dLon = toRadians(b.lon - a.lon);
    const lat1 = toRadians(a.lat);
    const lat2 = toRadians(b.lat);
    const h =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
    return 2 * earthRadius * Math.asin(Math.sqrt(h));
  }

  function getEntityAnchorGeo(entity, lookup, relations) {
    const directGeo = getGeo(entity);
    if (directGeo) {
      return directGeo;
    }
    const pins = resolveDefaultPins(entity, lookup, relations);
    return pins[0]?.geo || null;
  }

  function entityWithinDistance(rootEntity, entity, filters, lookup, relations) {
    const miles = filters.distanceMiles;
    if (!miles || miles <= 0) {
      return true;
    }
    const rootGeo = getEntityAnchorGeo(rootEntity, lookup, relations);
    if (!rootGeo) {
      return true;
    }
    const maxMeters = miles * 1609.344;
    const pins = resolveDefaultPins(entity, lookup, relations);
    if (pins.length > 0) {
      return pins.some((pin) => haversineMeters(rootGeo, pin.geo) <= maxMeters);
    }
    const geo = getGeo(entity);
    if (!geo) {
      return false;
    }
    return haversineMeters(rootGeo, geo) <= maxMeters;
  }

  function normalizeBounds(bounds) {
    const lats = [bounds[0][0], bounds[1][0]];
    const lons = [bounds[0][1], bounds[1][1]];
    return {
      south: Math.min(...lats),
      north: Math.max(...lats),
      west: Math.min(...lons),
      east: Math.max(...lons),
    };
  }

  function isGeoInBounds(geo, bounds) {
    if (!geo) {
      return false;
    }
    const box = normalizeBounds(bounds);
    return (
      geo.lat >= box.south &&
      geo.lat <= box.north &&
      geo.lon >= box.west &&
      geo.lon <= box.east
    );
  }

  function entityHasGeoInBounds(entity, bounds, lookup, relations) {
    if (isGeoInBounds(getGeo(entity), bounds)) {
      return true;
    }
    return resolveDefaultPins(entity, lookup, relations).some((pin) => isGeoInBounds(pin.geo, bounds));
  }

  function collectEntityIdsInBounds(bounds, lookup, relations) {
    const ids = new Set();
    for (const entity of lookup.values()) {
      if (entityHasGeoInBounds(entity, bounds, lookup, relations)) {
        ids.add(entity.id);
      }
    }
    return [...ids];
  }

  function neighbors(entityId, relations) {
    const result = [];
    for (const rel of relations) {
      if (rel.from === entityId) {
        result.push({ entityId: rel.to, rel });
      } else if (rel.to === entityId) {
        result.push({ entityId: rel.from, rel });
      }
    }
    return result;
  }

  function isLocationEntity(entity) {
    return entity?.type === 'Location';
  }

  function isLocationRelation(rel, lookup) {
    if (rel.kind === 'location') {
      return true;
    }
    const target = lookup.get(rel.to);
    const source = lookup.get(rel.from);
    return isLocationEntity(target) || isLocationEntity(source);
  }

  function makePin(sourceEntity, locationEntity, label, connectionType, lookup) {
    const geo = getGeo(locationEntity);
    if (!geo) {
      return null;
    }

    return {
      key: `${sourceEntity.id}:${locationEntity.id}:${label}:${connectionType}`,
      sourceEntity,
      locationEntity,
      label,
      connectionType,
      geo,
      colorType: sourceEntity.type,
    };
  }

  function dedupePins(pins) {
    const seen = new Set();
    return pins.filter((pin) => {
      if (!pin || seen.has(pin.key)) {
        return false;
      }
      seen.add(pin.key);
      return true;
    });
  }

  function spreadOverlappingPins(pins) {
    const groups = new Map();

    for (const pin of pins) {
      const key = `${pin.geo.lat.toFixed(5)}:${pin.geo.lon.toFixed(5)}`;
      if (!groups.has(key)) {
        groups.set(key, []);
      }
      groups.get(key).push(pin);
    }

    const spread = [];
    for (const group of groups.values()) {
      if (group.length === 1) {
        spread.push(group[0]);
        continue;
      }

      group.forEach((pin, index) => {
        const angle = (Math.PI * 2 * index) / group.length - Math.PI / 2;
        const radius = 0.00011;
        spread.push({
          ...pin,
          geo: {
            lat: pin.geo.lat + Math.sin(angle) * radius,
            lon: pin.geo.lon + Math.cos(angle) * radius,
          },
        });
      });
    }

    return spread;
  }

  function pushPrimaryPin(entity, fieldName, roleLabel, pins, lookup) {
    const locationId = readAttr(entity, fieldName) || (fieldName.endsWith('_ID') ? null : entity.locationId);
    if (!locationId || !lookup.has(locationId)) {
      return;
    }
    const location = lookup.get(locationId);
    const sourceLabel =
      entity.type === 'Organisation' ? readAttr(entity, 'NAME') || displayName(entity, lookup) : displayName(entity, lookup);
    const pin = makePin(entity, location, formatPinLabel(sourceLabel, roleLabel), 'primary', lookup);
    if (pin) {
      pins.push(pin);
    }
  }

  function resolveLinkedPerson(entity, lookup) {
    const personId = readAttr(entity, 'PERSON_ID');
    if (personId && lookup.has(personId)) {
      return lookup.get(personId);
    }
    return null;
  }

  function resolveOwnerPerson(entity, lookup, relations) {
    const holderId = readAttr(entity, 'HALTER_PERSONALIE_ID') || readAttr(entity, 'HALTER_PERSON_ID');
    if (holderId) {
      const holder = lookup.get(holderId);
      if (holder?.type === 'Person') {
        return holder;
      }
      if (holder?.type === 'Identity Record') {
        const personId = readAttr(holder, 'PERSON_ID');
        if (personId && lookup.has(personId)) {
          return lookup.get(personId);
        }
      }
    }

    for (const { entityId, rel } of neighbors(entity.id, relations)) {
      const related = lookup.get(entityId);
      if (related?.type === 'Person' && /owner|halter|holder/i.test(rel.label || '')) {
        return related;
      }
    }

    return null;
  }

  function resolvePersonAddressPins(entity, lookup, relations, roles) {
    const pins = [];
    const allowedRoles = new Set(roles);

    for (const { entityId, rel } of neighbors(entity.id, relations)) {
      const location = lookup.get(entityId);
      if (!isLocationEntity(location)) {
        continue;
      }
      const role = rel.role || rel.label;
      if (!allowedRoles.has(role)) {
        continue;
      }
      const pin = makePin(entity, location, formatPinLabel(displayName(entity, lookup), role), 'direct', lookup);
      if (pin) {
        pins.push(pin);
      }
    }

    if (pins.length === 0 && entity.personLocations) {
      for (const entry of entity.personLocations) {
        if (!allowedRoles.has(entry.label)) {
          continue;
        }
        const location = lookup.get(entry.locationId);
        if (!location) {
          continue;
        }
        const pin = makePin(entity, location, formatPinLabel(displayName(entity, lookup), entry.label), 'direct', lookup);
        if (pin) {
          pins.push(pin);
        }
      }
    }

    return pins;
  }

  function resolveDirectLocationRelations(entity, lookup, relations) {
    const pins = [];
    for (const { entityId, rel } of neighbors(entity.id, relations)) {
      const location = lookup.get(entityId);
      if (!isLocationEntity(location)) {
        continue;
      }
      const role = rel.role || rel.label || 'Location';
      const pin = makePin(entity, location, formatPinLabel(displayName(entity, lookup), role), 'direct', lookup);
      if (pin) {
        pins.push(pin);
      }
    }
    return pins;
  }

  function resolveIndirectLocationPins(entity, lookup, relations, maxHops, useDefaultBehavior, visited = new Set()) {
    const pins = [];
    const seen = new Set([entity.id]);
    let frontier = [entity.id];

    for (let hop = 1; hop <= maxHops; hop += 1) {
      const next = [];
      for (const currentId of frontier) {
        for (const { entityId } of neighbors(currentId, relations)) {
          if (seen.has(entityId)) {
            continue;
          }
          seen.add(entityId);
          const related = lookup.get(entityId);
          if (!related || isLocationEntity(related)) {
            continue;
          }

          if (useDefaultBehavior) {
            const relatedPins = resolveDefaultPins(related, lookup, relations, {}, visited).map((pin) => ({
              ...pin,
              connectionType: hop === 1 ? 'direct' : 'indirect',
            }));
            pins.push(...relatedPins);
          } else {
            const locationPins = resolveDirectLocationRelations(related, lookup, relations).map((pin) => ({
              ...pin,
              connectionType: 'indirect',
            }));
            pins.push(...locationPins);
            if (locationPins.length === 0) {
              pins.push(
                ...resolveDefaultPins(related, lookup, relations, {}, visited).map((pin) => ({
                  ...pin,
                  connectionType: 'indirect',
                }))
              );
            }
          }

          if (hop < maxHops) {
            next.push(entityId);
          }
        }
      }
      frontier = next;
    }

    return pins;
  }

  function resolveDocumentsPins(entity, lookup, relations) {
    const pins = [];
    const inlineGeo = getGeo(entity);
    if (inlineGeo) {
      const syntheticLocation = {
        id: `${entity.id}:inline-found-at`,
        type: 'Location',
        attributes: {
          BEZEICHNUNG: readAttr(entity, 'FUNDORT_BEZEICHNUNG') || displayName(entity, lookup),
        },
        geo: inlineGeo,
      };
      const pin = makePin(entity, syntheticLocation, displayName(entity, lookup), 'inline', lookup);
      if (pin) {
        pins.push(pin);
        return pins;
      }
    }

    pushPrimaryPin(entity, 'FUNDORT_OERTLICHKEIT_ID', 'Found Location', pins, lookup);
    if (pins.length === 0) {
      pins.push(...resolveDirectLocationRelations(entity, lookup, relations));
    }
    if (pins.length === 0) {
      pins.push(...resolveIndirectLocationPins(entity, lookup, relations, 2, true, new Set([entity.id])));
    }
    return pins;
  }

  function resolveDefaultPins(entity, lookup, relations, options = {}, visited = new Set()) {
    if (!entity || visited.has(entity.id)) {
      return [];
    }
    visited.add(entity.id);

    const pins = [];
    const homeOnlyForPerson = Boolean(options.homeOnlyForPerson);

    switch (entity.type) {
      case 'Location': {
        const pin = makePin(entity, entity, displayName(entity, lookup), 'inline', lookup);
        if (pin) {
          pins.push(pin);
        }
        break;
      }
      case 'Organisation': {
        pushPrimaryPin(entity, 'SITZ_OERTLICHKEIT_ID', 'Headquarter', pins, lookup);
        if (pins.length === 0) {
          pins.push(...resolveDirectLocationRelations(entity, lookup, relations));
        }
        if (pins.length === 0) {
          pins.push(...resolveIndirectLocationPins(entity, lookup, relations, 2, true, visited));
        }
        break;
      }
      case 'Person': {
        const roles = homeOnlyForPerson ? ['Home'] : PERSON_ADDRESS_ROLES;
        pins.push(...resolvePersonAddressPins(entity, lookup, relations, roles));
        if (pins.length === 0) {
          pins.push(...resolveIndirectLocationPins(entity, lookup, relations, 2, true, visited));
        }
        break;
      }
      case 'Criminal Offence': {
        pushPrimaryPin(entity, 'TATORT_ID', 'Scene Location', pins, lookup);
        if (pins.length === 0) {
          pins.push(...resolveDirectLocationRelations(entity, lookup, relations));
        }
        if (pins.length === 0) {
          pins.push(...resolveIndirectLocationPins(entity, lookup, relations, 2, true, visited));
        }
        break;
      }
      case 'Regulatory Offence': {
        pushPrimaryPin(entity, 'TATORT_ID', 'Offence Scene Location', pins, lookup);
        if (pins.length === 0) {
          pins.push(...resolveDirectLocationRelations(entity, lookup, relations));
        }
        if (pins.length === 0) {
          pins.push(...resolveIndirectLocationPins(entity, lookup, relations, 2, true, visited));
        }
        break;
      }
      case 'Traffic Accident': {
        pushPrimaryPin(entity, 'ORT_ID', 'Accident Location', pins, lookup);
        if (pins.length === 0) {
          pins.push(...resolveDirectLocationRelations(entity, lookup, relations));
        }
        if (pins.length === 0) {
          pins.push(...resolveIndirectLocationPins(entity, lookup, relations, 2, true, visited));
        }
        break;
      }
      case 'Police Measure': {
        pushPrimaryPin(entity, 'ORT_ID', 'Measure Location', pins, lookup);
        if (pins.length === 0) {
          pins.push(...resolveDirectLocationRelations(entity, lookup, relations));
        }
        if (pins.length === 0) {
          pins.push(...resolveIndirectLocationPins(entity, lookup, relations, 2, true, visited));
        }
        break;
      }
      case 'Firearm': {
        pushPrimaryPin(entity, 'FUNDORT_OERTLICHKEIT_ID', 'Found Location', pins, lookup);
        if (pins.length === 0) {
          pins.push(...resolveDirectLocationRelations(entity, lookup, relations));
        }
        if (pins.length === 0) {
          pins.push(...resolveIndirectLocationPins(entity, lookup, relations, 2, true, visited));
        }
        break;
      }
      case 'Documents':
        return dedupePins(resolveDocumentsPins(entity, lookup, relations));
      case 'Physical Description':
      case 'Identity Record': {
        const person = resolveLinkedPerson(entity, lookup);
        if (person) {
          return dedupePins(resolveDefaultPins(person, lookup, relations, {}, visited));
        }
        pins.push(...resolveIndirectLocationPins(entity, lookup, relations, 2, true, visited));
        break;
      }
      case 'Case File': {
        for (const { entityId } of neighbors(entity.id, relations)) {
          const related = lookup.get(entityId);
          if (!related || isLocationEntity(related)) {
            continue;
          }
          pins.push(...resolveDefaultPins(related, lookup, relations, {}, visited));
        }
        break;
      }
      case 'Motor Vehicle': {
        const person = resolveOwnerPerson(entity, lookup, relations);
        if (person) {
          return dedupePins(resolveDefaultPins(person, lookup, relations, {}, visited));
        }
        pins.push(...resolveIndirectLocationPins(entity, lookup, relations, 2, true, visited));
        break;
      }
      case 'Tip and Lead':
      case 'Case Event':
        pins.push(...resolveIndirectLocationPins(entity, lookup, relations, 2, true, visited));
        break;
      default:
        if (getGeo(entity)) {
          const pin = makePin(entity, entity, displayName(entity, lookup), 'inline', lookup);
          if (pin) {
            pins.push(pin);
          }
        } else if (entity.locationId && lookup.has(entity.locationId)) {
          pushPrimaryPin(entity, 'locationId', 'Location', pins, lookup);
        } else {
          pins.push(...resolveDirectLocationRelations(entity, lookup, relations));
          if (pins.length === 0) {
            pins.push(...resolveIndirectLocationPins(entity, lookup, relations, 2, true, visited));
          }
        }
        break;
    }

    return dedupePins(pins);
  }

  function entityReferencesLocation(entity, locationId) {
    const fkFields = [
      ['TATORT_ID', 'Scene Location'],
      ['ORT_ID', 'Accident Location'],
      ['FUNDORT_OERTLICHKEIT_ID', 'Found Location'],
      ['SITZ_OERTLICHKEIT_ID', 'Headquarter'],
    ];

    for (const [field, roleLabel] of fkFields) {
      if (readAttr(entity, field) === locationId) {
        return roleLabel;
      }
    }

    if (entity.locationId === locationId) {
      return 'Location';
    }

    return null;
  }

  function resolveRelatedEntityPins(rootEntity, relatedEntity, relation, hop, lookup, relations) {
    const connectionType = hop === 1 ? 'direct' : 'indirect';

    if (hop === 1 && isLocationEntity(rootEntity) && !isLocationEntity(relatedEntity)) {
      const locationRole = entityReferencesLocation(relatedEntity, rootEntity.id);
      if (locationRole) {
        const pin = makePin(
          relatedEntity,
          rootEntity,
          formatPinLabel(displayName(relatedEntity, lookup), locationRole),
          'primary',
          lookup
        );
        if (pin) {
          return [pin];
        }
      }

      if (relation && (relation.kind === 'location' || isLocationRelation(relation, lookup))) {
        const role = relation.role || relation.label || 'Location';
        const pin = makePin(
          relatedEntity,
          rootEntity,
          formatPinLabel(displayName(relatedEntity, lookup), role),
          'direct',
          lookup
        );
        if (pin) {
          return [pin];
        }
      }
    }

    return resolveDefaultPins(relatedEntity, lookup, relations).map((pin) => ({
      ...pin,
      connectionType,
    }));
  }

  function collectRelatedEntities(rootEntity, lookup, relations, maxHops, filters) {
    const direct = [];
    const seenDirect = new Set([rootEntity.id]);

    for (const { entityId, rel } of neighbors(rootEntity.id, relations)) {
      if (seenDirect.has(entityId)) {
        continue;
      }
      seenDirect.add(entityId);
      const related = lookup.get(entityId);
      if (!related || isLocationEntity(related)) {
        continue;
      }
      if (passesFilters(related, filters, rootEntity, lookup, relations)) {
        direct.push({ entity: related, relation: rel, hop: 1 });
      }
    }

    if (direct.length > 0) {
      return direct;
    }

    const entries = [];
    const seen = new Set([rootEntity.id]);
    let frontier = [rootEntity.id];

    for (let hop = 1; hop <= maxHops; hop += 1) {
      const next = [];
      for (const currentId of frontier) {
        for (const { entityId, rel } of neighbors(currentId, relations)) {
          if (seen.has(entityId)) {
            continue;
          }
          seen.add(entityId);
          const related = lookup.get(entityId);
          if (!related || isLocationEntity(related)) {
            continue;
          }
          if (passesFilters(related, filters, rootEntity, lookup, relations)) {
            entries.push({ entity: related, relation: rel, hop });
          }
          if (hop < maxHops) {
            next.push(entityId);
          }
        }
      }
      frontier = next;
    }

    return entries;
  }

  function resolveRelatedPins(rootEntity, lookup, relations, filters = {}) {
    const relatedEntries = collectRelatedEntities(rootEntity, lookup, relations, 2, filters);
    const pins = [];

    for (const { entity, relation, hop } of relatedEntries) {
      pins.push(...resolveRelatedEntityPins(rootEntity, entity, relation, hop, lookup, relations));
    }

    return dedupePins(pins);
  }

  function resolvePinsForEntity(rootEntity, lookup, relations, settings = {}) {
    const defaultPins = resolveDefaultPins(rootEntity, lookup, relations);
    if (!settings.showRelated) {
      return defaultPins;
    }

    const relatedPins = resolveRelatedPins(rootEntity, lookup, relations, {
      typeFilters: settings.typeFilters instanceof Set ? settings.typeFilters : null,
      typeFilter: settings.typeFilter || 'all',
      timePeriod: settings.timePeriod || 'all',
      distanceMiles: settings.distanceMiles || null,
    });

    return dedupePins([...defaultPins, ...relatedPins]);
  }

  function findGeographicArea(term, lookup) {
    const normalized = term.trim().toLowerCase();
    if (!normalized || normalized.length < 3) {
      return null;
    }

    for (const area of GEO_AREAS) {
      if (area.names.some((name) => normalized === name)) {
        return area;
      }
    }

    const matchingLocations = [];
    for (const entity of lookup.values()) {
      if (!isLocationEntity(entity)) {
        continue;
      }
      const city = (readAttr(entity, 'ORTSNAME') || readAttr(entity, 'REGION') || '')
        .trim()
        .toLowerCase();
      if (city && normalized === city) {
        matchingLocations.push(entity);
      }
    }

    if (matchingLocations.length === 0) {
      return null;
    }

    const lats = matchingLocations.map((entity) => getGeo(entity)?.lat).filter(Boolean);
    const lons = matchingLocations.map((entity) => getGeo(entity)?.lon).filter(Boolean);
    if (lats.length === 0 || lons.length === 0) {
      return null;
    }

    const pad = 0.03;
    return {
      id: `area:${normalized}`,
      label: matchingLocations[0].attributes?.ORTSNAME || term.trim(),
      bounds: [
        [Math.min(...lats) - pad, Math.min(...lons) - pad],
        [Math.max(...lats) + pad, Math.max(...lons) + pad],
      ],
    };
  }

  window.MapLocations = {
    resolveDefaultPins,
    resolveRelatedPins,
    resolvePinsForEntity,
    collectRelatedEntities,
    findGeographicArea,
    collectEntityIdsInBounds,
    entityHasGeoInBounds,
    isGeoInBounds,
    getEntityAnchorGeo,
    passesFilters,
    dedupePins,
    spreadOverlappingPins,
  };
})();
