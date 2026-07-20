(function () {
  const PERSON_ADDRESS_ROLES = ['Home', 'Work', 'Whereabouts'];

  function computeBoundsFromPolygon(polygon, pad = 0) {
    const lats = polygon.map((point) => point.lat);
    const lons = polygon.map((point) => point.lon);
    return [
      [Math.min(...lats) - pad, Math.min(...lons) - pad],
      [Math.max(...lats) + pad, Math.max(...lons) + pad],
    ];
  }

  function distanceMeters(a, b) {
    const lat1 = a.lat;
    const lon1 = a.lon ?? a.lng;
    const lat2 = b.lat;
    const lon2 = b.lon ?? b.lng;
    const earthRadius = 6371000;
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLon = ((lon2 - lon1) * Math.PI) / 180;
    const lat1Rad = (lat1 * Math.PI) / 180;
    const lat2Rad = (lat2 * Math.PI) / 180;
    const haversine =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(lat1Rad) * Math.cos(lat2Rad) * Math.sin(dLon / 2) ** 2;
    return 2 * earthRadius * Math.asin(Math.sqrt(haversine));
  }

  function computeBoundsFromCircle(center, radiusMeters, pad = 0.002) {
    const lat = center.lat;
    const lon = center.lon ?? center.lng;
    const radiusLat = radiusMeters / 111320;
    const cosLat = Math.cos((lat * Math.PI) / 180);
    const radiusLon = radiusMeters / (111320 * Math.max(Math.abs(cosLat), 0.01));
    return [
      [lat - radiusLat - pad, lon - radiusLon - pad],
      [lat + radiusLat + pad, lon + radiusLon + pad],
    ];
  }

  function normalizeAreaRecord(area) {
    const polygon = area.polygon ? area.polygon.map((point) => ({ ...point })) : null;
    const line = area.line ? area.line.map((point) => ({ ...point })) : null;
    const center = area.center
      ? { lat: area.center.lat, lon: area.center.lon ?? area.center.lng }
      : null;
    const radiusMeters =
      typeof area.radiusMeters === 'number' && area.radiusMeters > 0 ? area.radiusMeters : null;
    const bufferMeters =
      typeof area.bufferMeters === 'number' && area.bufferMeters > 0 ? area.bufferMeters : null;
    const shape =
      area.shape ||
      (line?.length >= 2 && bufferMeters
        ? 'line'
        : center && radiusMeters
          ? 'circle'
          : polygon?.length >= 3
            ? 'polygon'
            : 'rectangle');
    const bounds =
      area.bounds ||
      (shape === 'line' && line?.length >= 2 && bufferMeters
        ? computeBoundsFromLine(line, bufferMeters)
        : shape === 'circle' && center && radiusMeters
          ? computeBoundsFromCircle(center, radiusMeters)
          : polygon?.length >= 3
            ? computeBoundsFromPolygon(polygon, 0.002)
            : null);

    return {
      ...area,
      shape,
      polygon,
      line,
      center,
      radiusMeters,
      bufferMeters,
      bounds,
    };
  }

  const MUNICH_POLYGON = window.GEO_BOUNDARIES?.munich || [];

  const GEO_AREAS = [
    normalizeAreaRecord({
      id: 'munich',
      names: ['münchen', 'munich', 'muenchen'],
      label: 'München',
      source: 'catalog',
      shape: 'polygon',
      polygon: MUNICH_POLYGON,
    }),
  ].filter((area) => area.polygon?.length >= 3 || area.bounds);

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

    const parsedDate = window.DisplayNames.parseTimestamp(dateValue);
    if (!parsedDate) {
      return false;
    }
    const parsed = parsedDate.getTime();

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
    if (filters.typeFilters instanceof Set) {
      if (filters.typeFilters.size === 0) {
        return false;
      }
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

  function pointInCircle(geo, center, radiusMeters) {
    if (!geo || !center || !(radiusMeters > 0)) {
      return false;
    }
    return distanceMeters(geo, center) <= radiusMeters;
  }

  function pointInPolygon(geo, polygon) {
    if (!geo || !polygon || polygon.length < 3) {
      return false;
    }

    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const xi = polygon[i].lon;
      const yi = polygon[i].lat;
      const xj = polygon[j].lon;
      const yj = polygon[j].lat;
      const intersects =
        yi > geo.lat !== yj > geo.lat &&
        geo.lon < ((xj - xi) * (geo.lat - yi)) / (yj - yi + Number.EPSILON) + xi;
      if (intersects) {
        inside = !inside;
      }
    }
    return inside;
  }

  function distancePointToSegmentMeters(point, start, end) {
    const latScale = 111320;
    const lonScale = 111320 * Math.cos((point.lat * Math.PI) / 180);
    const px = point.lon * lonScale;
    const py = point.lat * latScale;
    const ax = start.lon * lonScale;
    const ay = start.lat * latScale;
    const bx = end.lon * lonScale;
    const by = end.lat * latScale;
    const dx = bx - ax;
    const dy = by - ay;

    if (dx === 0 && dy === 0) {
      return distanceMeters(point, start);
    }

    const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
    const closestX = ax + t * dx;
    const closestY = ay + t * dy;
    const closestLon = closestX / lonScale;
    const closestLat = closestY / latScale;
    return distanceMeters(point, { lat: closestLat, lon: closestLon });
  }

  function pointNearLine(geo, line, bufferMeters) {
    if (!geo || !line || line.length < 2 || !(bufferMeters > 0)) {
      return false;
    }

    for (let index = 0; index < line.length - 1; index += 1) {
      if (distancePointToSegmentMeters(geo, line[index], line[index + 1]) <= bufferMeters) {
        return true;
      }
    }

    return false;
  }

  function computeBoundsFromLine(line, bufferMeters, pad = 0) {
    const lats = line.map((point) => point.lat);
    const lons = line.map((point) => point.lon);
    const midLat = (Math.min(...lats) + Math.max(...lats)) / 2;
    const latPad = bufferMeters / 111320 + pad;
    const lonPad = bufferMeters / (111320 * Math.cos((midLat * Math.PI) / 180)) + pad;
    return [
      [Math.min(...lats) - latPad, Math.min(...lons) - lonPad],
      [Math.max(...lats) + latPad, Math.max(...lons) + lonPad],
    ];
  }

  function simplifyDrawPath(latLngs, minDistanceMeters = 12) {
    if (!latLngs?.length) {
      return [];
    }

    const simplified = [{ lat: latLngs[0].lat, lon: latLngs[0].lng ?? latLngs[0].lon }];
    for (let index = 1; index < latLngs.length; index += 1) {
      const current = {
        lat: latLngs[index].lat,
        lon: latLngs[index].lng ?? latLngs[index].lon,
      };
      const last = simplified[simplified.length - 1];
      if (distanceMeters(last, current) >= minDistanceMeters) {
        simplified.push(current);
      }
    }

    const lastInput = {
      lat: latLngs[latLngs.length - 1].lat,
      lon: latLngs[latLngs.length - 1].lng ?? latLngs[latLngs.length - 1].lon,
    };
    const lastSimplified = simplified[simplified.length - 1];
    if (distanceMeters(lastSimplified, lastInput) > 1) {
      simplified.push(lastInput);
    }

    return simplified;
  }

  function entityHasGeoInArea(entity, area, lookup, relations) {
    if (!area) {
      return true;
    }

    const pins = resolveDefaultPins(entity, lookup, relations);
    const geos = [getGeo(entity), ...pins.map((pin) => pin.geo)].filter(Boolean);

    if (area.shape === 'polygon' && area.polygon?.length >= 3) {
      return geos.some((geo) => pointInPolygon(geo, area.polygon));
    }

    if (area.shape === 'line' && area.line?.length >= 2 && area.bufferMeters > 0) {
      return geos.some((geo) => pointNearLine(geo, area.line, area.bufferMeters));
    }

    if (area.shape === 'circle' && area.center && area.radiusMeters > 0) {
      return geos.some((geo) => pointInCircle(geo, area.center, area.radiusMeters));
    }

    if (area.bounds) {
      return geos.some((geo) => isGeoInBounds(geo, area.bounds));
    }

    return false;
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

  function collectEntityIdsInArea(area, lookup, relations) {
    const ids = new Set();
    for (const entity of lookup.values()) {
      if (entityHasGeoInArea(entity, area, lookup, relations)) {
        ids.add(entity.id);
      }
    }
    return [...ids];
  }

  function cloneGeographicArea(area) {
    if (!area) {
      return null;
    }
    return normalizeAreaRecord({
      id: area.id,
      label: area.label,
      bounds: area.bounds ? [[...area.bounds[0]], [...area.bounds[1]]] : null,
      source: area.source || 'catalog',
      shape: area.shape || 'rectangle',
      names: area.names ? [...area.names] : undefined,
      polygon: area.polygon ? area.polygon.map((point) => ({ ...point })) : null,
      line: area.line ? area.line.map((point) => ({ ...point })) : null,
      center: area.center ? { ...area.center } : null,
      radiusMeters: area.radiusMeters ?? null,
      bufferMeters: area.bufferMeters ?? null,
    });
  }

  function areaMatchesTerm(area, normalized) {
    if (!normalized) {
      return true;
    }
    if (area.label?.toLowerCase().includes(normalized)) {
      return true;
    }
    return (area.names || []).some(
      (name) => name.includes(normalized) || normalized.includes(name)
    );
  }

  function areaNameKeys(area) {
    const keys = new Set();
    if (area.label) {
      keys.add(area.label.toLowerCase());
    }
    if (area.id) {
      keys.add(area.id.toLowerCase().replace(/^area:/, ''));
    }
    for (const name of area.names || []) {
      keys.add(String(name).toLowerCase());
    }
    return keys;
  }

  function areasShareName(left, right) {
    const leftKeys = areaNameKeys(left);
    for (const key of areaNameKeys(right)) {
      if (leftKeys.has(key)) {
        return true;
      }
    }
    return false;
  }

  function listLocationAreas(lookup) {
    const byKey = new Map();
    for (const entity of lookup.values()) {
      if (!isLocationEntity(entity)) {
        continue;
      }
      const city = (readAttr(entity, 'ORTSNAME') || readAttr(entity, 'REGION') || '').trim();
      if (!city) {
        continue;
      }
      const key = city.toLowerCase();
      if (byKey.has(key)) {
        byKey.get(key).matchingLocations.push(entity);
        continue;
      }
      byKey.set(key, { city, matchingLocations: [entity] });
    }

    const areas = [];
    for (const { city, matchingLocations } of byKey.values()) {
      const lats = matchingLocations.map((entity) => getGeo(entity)?.lat).filter(Boolean);
      const lons = matchingLocations.map((entity) => getGeo(entity)?.lon).filter(Boolean);
      if (lats.length === 0 || lons.length === 0) {
        continue;
      }
      const pad = 0.03;
      const normalized = city.toLowerCase();
      areas.push({
        id: `area:${normalized}`,
        label: city,
        names: [normalized],
        source: 'location',
        shape: 'rectangle',
        bounds: [
          [Math.min(...lats) - pad, Math.min(...lons) - pad],
          [Math.max(...lats) + pad, Math.max(...lons) + pad],
        ],
      });
    }

    return areas.sort((a, b) => a.label.localeCompare(b.label));
  }

  function listAllGeographicAreas(lookup) {
    const seen = new Set();
    const areas = [];

    for (const area of GEO_AREAS) {
      seen.add(area.id);
      areas.push(normalizeAreaRecord({ ...area, source: area.source || 'catalog' }));
    }

    for (const area of listLocationAreas(lookup)) {
      if (seen.has(area.id)) {
        continue;
      }
      if (areas.some((catalogArea) => areasShareName(catalogArea, area))) {
        continue;
      }
      seen.add(area.id);
      areas.push(normalizeAreaRecord(area));
    }

    return areas;
  }

  function searchGeographicAreas(term, lookup, limit = 8) {
    const normalized = term.trim().toLowerCase();
    const areas = listAllGeographicAreas(lookup).filter((area) => areaMatchesTerm(area, normalized));
    return areas.slice(0, limit);
  }

  function boundsFromLatLngBounds(latLngBounds, label = 'Custom area') {
    const sw = latLngBounds.getSouthWest();
    const ne = latLngBounds.getNorthEast();
    return {
      id: `area:custom-${Date.now()}`,
      label,
      source: 'drawn',
      shape: 'rectangle',
      bounds: [
        [sw.lat, sw.lng],
        [ne.lat, ne.lng],
      ],
    };
  }

  function circleFromLatLngPoints(center, edge, label = 'Custom area') {
    const radiusMeters = distanceMeters(center, edge);
    const normalizedCenter = {
      lat: center.lat,
      lon: center.lng ?? center.lon,
    };
    return normalizeAreaRecord({
      id: `area:custom-${Date.now()}`,
      label,
      source: 'drawn',
      shape: 'circle',
      center: normalizedCenter,
      radiusMeters,
    });
  }

  function polygonFromLatLngs(latLngs, label = 'Custom area') {
    const points = latLngs.map((point) => ({
      lat: point.lat,
      lon: point.lng ?? point.lon,
    }));
    const lats = points.map((point) => point.lat);
    const lons = points.map((point) => point.lon);
    const pad = 0.002;
    return {
      id: `area:custom-${Date.now()}`,
      label,
      source: 'drawn',
      shape: 'polygon',
      polygon: points,
      bounds: [
        [Math.min(...lats) - pad, Math.min(...lons) - pad],
        [Math.max(...lats) + pad, Math.max(...lons) + pad],
      ],
    };
  }

  const DEFAULT_LINE_BUFFER_METERS = 500;

  function lineFromLatLngs(latLngs, label = 'Custom area', bufferMeters = DEFAULT_LINE_BUFFER_METERS) {
    const points = latLngs.map((point) => ({
      lat: point.lat,
      lon: point.lng ?? point.lon,
    }));

    return normalizeAreaRecord({
      id: `area:custom-${Date.now()}`,
      label,
      source: 'drawn',
      shape: 'line',
      line: points,
      bufferMeters,
    });
  }

  function findGeographicArea(term, lookup) {
    const normalized = term.trim().toLowerCase();
    if (!normalized || normalized.length < 3) {
      return null;
    }

    for (const area of GEO_AREAS) {
      if (area.names.some((name) => normalized === name)) {
        return normalizeAreaRecord({ ...area, source: 'catalog' });
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
    return normalizeAreaRecord({
      id: `area:${normalized}`,
      label: matchingLocations[0].attributes?.ORTSNAME || term.trim(),
      source: 'location',
      shape: 'rectangle',
      bounds: [
        [Math.min(...lats) - pad, Math.min(...lons) - pad],
        [Math.max(...lats) + pad, Math.max(...lons) + pad],
      ],
    });
  }

  function encodeAreaShareParam(area) {
    if (!area) {
      return null;
    }
    const payload = cloneGeographicArea(area);
    const json = JSON.stringify(payload);
    return btoa(unescape(encodeURIComponent(json)))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
  }

  function decodeAreaShareParam(param) {
    if (!param) {
      return null;
    }
    try {
      const normalized = String(param).replace(/-/g, '+').replace(/_/g, '/');
      const json = decodeURIComponent(escape(atob(normalized)));
      return normalizeAreaRecord(JSON.parse(json));
    } catch {
      return null;
    }
  }

  function buildAreaShareUrl(area, baseUrl = window.location.href) {
    const encoded = encodeAreaShareParam(area);
    if (!encoded) {
      return baseUrl;
    }
    const url = new URL(baseUrl, window.location.origin);
    url.searchParams.set('area', encoded);
    return url.toString();
  }

  window.MapLocations = {
    resolveDefaultPins,
    resolveRelatedPins,
    resolvePinsForEntity,
    collectRelatedEntities,
    findGeographicArea,
    searchGeographicAreas,
    listAllGeographicAreas,
    collectEntityIdsInBounds,
    collectEntityIdsInArea,
    entityHasGeoInArea,
    entityHasGeoInBounds,
    boundsFromLatLngBounds,
    circleFromLatLngPoints,
    polygonFromLatLngs,
    lineFromLatLngs,
    simplifyDrawPath,
    DEFAULT_LINE_BUFFER_METERS,
    cloneArea: cloneGeographicArea,
    encodeAreaShareParam,
    decodeAreaShareParam,
    buildAreaShareUrl,
    computeBoundsFromPolygon,
    computeBoundsFromCircle,
    distanceMeters,
    normalizeAreaRecord,
    isGeoInBounds,
    getEntityAnchorGeo,
    passesFilters,
    dedupePins,
    spreadOverlappingPins,
  };
})();
