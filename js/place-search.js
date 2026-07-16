(function () {
  const GERMANY_VIEWBOX = '5.8663,55.0992,15.0419,47.2701';
  const GERMANY_BBOX = '5.8663,47.2701,15.0419,55.0992';
  const GERMANY_COUNTRY_CODE = 'de';

  const PHOTON_BASE = 'https://photon.komoot.io/api/';
  const NOMINATIM_BASE = 'https://nominatim.openstreetmap.org';

  const PREFERRED_PLACE_TYPES = new Set([
    'administrative',
    'city',
    'town',
    'village',
    'hamlet',
    'suburb',
    'neighbourhood',
    'neighborhood',
    'quarter',
    'borough',
    'municipality',
    'state',
    'county',
    'region',
    'district',
    'locality',
  ]);

  const EXCLUDED_PLACE_TYPES = new Set([
    'house',
    'building',
    'station',
    'halt',
    'peak',
    'isolated_dwelling',
    'farm',
    'street',
    'postcode',
    'yes',
    'water',
    'industrial',
    'construction',
    'farmyard',
    'retail',
  ]);

  const PHOTON_EXCLUDED_TYPES = new Set(['house', 'street', 'postcode']);
  const PHOTON_ALLOWED_KEYS = new Set(['place', 'boundary']);

  const GERMANY_AREA_SUGGESTIONS = [
    { id: 'default:berlin', label: 'Berlin', displayName: 'Berlin, Deutschland', placeType: 'city' },
    { id: 'default:hamburg', label: 'Hamburg', displayName: 'Hamburg, Deutschland', placeType: 'city' },
    { id: 'default:muenchen', label: 'München', displayName: 'München, Bayern, Deutschland', placeType: 'city' },
    { id: 'default:koeln', label: 'Köln', displayName: 'Köln, Nordrhein-Westfalen, Deutschland', placeType: 'city' },
    { id: 'default:frankfurt', label: 'Frankfurt am Main', displayName: 'Frankfurt am Main, Hessen, Deutschland', placeType: 'city' },
    { id: 'default:stuttgart', label: 'Stuttgart', displayName: 'Stuttgart, Baden-Württemberg, Deutschland', placeType: 'city' },
    { id: 'default:duesseldorf', label: 'Düsseldorf', displayName: 'Düsseldorf, Nordrhein-Westfalen, Deutschland', placeType: 'city' },
    { id: 'default:leipzig', label: 'Leipzig', displayName: 'Leipzig, Sachsen, Deutschland', placeType: 'city' },
    { id: 'default:dresden', label: 'Dresden', displayName: 'Dresden, Sachsen, Deutschland', placeType: 'city' },
    { id: 'default:nuernberg', label: 'Nürnberg', displayName: 'Nürnberg, Bayern, Deutschland', placeType: 'city' },
    { id: 'default:bremen', label: 'Bremen', displayName: 'Bremen, Deutschland', placeType: 'city' },
    { id: 'default:hannover', label: 'Hannover', displayName: 'Hannover, Niedersachsen, Deutschland', placeType: 'city' },
    { id: 'default:bayern', label: 'Bayern', displayName: 'Bayern, Deutschland', placeType: 'state' },
    { id: 'default:nrw', label: 'Nordrhein-Westfalen', displayName: 'Nordrhein-Westfalen, Deutschland', placeType: 'state' },
    { id: 'default:baden-wuerttemberg', label: 'Baden-Württemberg', displayName: 'Baden-Württemberg, Deutschland', placeType: 'state' },
    { id: 'default:hessen', label: 'Hessen', displayName: 'Hessen, Deutschland', placeType: 'state' },
    { id: 'default:schwabing', label: 'Schwabing', displayName: 'Schwabing, München, Bayern, Deutschland', placeType: 'suburb' },
    { id: 'default:kreuzberg', label: 'Kreuzberg', displayName: 'Kreuzberg, Berlin, Deutschland', placeType: 'suburb' },
    { id: 'default:altstadt-hamburg', label: 'Altstadt', displayName: 'Altstadt, Hamburg, Deutschland', placeType: 'suburb' },
  ].map((area) => ({
    ...area,
    source: 'default',
    names: [area.label.toLowerCase()],
  }));

  const cache = new Map();
  let inflight = null;
  const resolveInflight = new Map();

  function normalizeOsmType(type) {
    const value = String(type || '').toLowerCase();
    if (value === 'n' || value === 'node') {
      return 'N';
    }
    if (value === 'r' || value === 'relation') {
      return 'R';
    }
    if (value === 'w' || value === 'way') {
      return 'W';
    }
    return String(type || 'X').toUpperCase();
  }

  function areaIdFromOsm(osmType, osmId) {
    if (!osmType || osmId === undefined || osmId === null) {
      return null;
    }
    return `place:${normalizeOsmType(osmType)}:${osmId}`;
  }

  function simplifyRing(ring, maxPoints = 80) {
    if (!ring || ring.length <= maxPoints) {
      return ring;
    }
    const step = Math.max(1, Math.floor(ring.length / maxPoints));
    const simplified = ring.filter((_, index) => index % step === 0);
    if (simplified[simplified.length - 1] !== ring[ring.length - 1]) {
      simplified.push(ring[ring.length - 1]);
    }
    return simplified;
  }

  function geoJsonToPolygon(geojson) {
    if (!geojson) {
      return null;
    }

    let ring = null;
    if (geojson.type === 'Polygon') {
      ring = geojson.coordinates?.[0];
    } else if (geojson.type === 'MultiPolygon') {
      const rings = geojson.coordinates?.map((polygon) => polygon[0]) || [];
      ring = rings.reduce((best, current) => (current.length > best.length ? current : best), []);
    }

    if (!ring || ring.length < 3) {
      return null;
    }

    const simplified = simplifyRing(ring);
    return simplified.map(([lon, lat]) => ({
      lat: Math.round(lat * 100000) / 100000,
      lon: Math.round(lon * 100000) / 100000,
    }));
  }

  function computeBoundsFromPolygon(polygon, pad = 0.002) {
    const lats = polygon.map((point) => point.lat);
    const lons = polygon.map((point) => point.lon);
    return [
      [Math.min(...lats) - pad, Math.min(...lons) - pad],
      [Math.max(...lats) + pad, Math.max(...lons) + pad],
    ];
  }

  function boundsFromBoundingBox(bbox, pad = 0.002) {
    if (!bbox || bbox.length !== 4) {
      return null;
    }
    const [minLat, maxLat, minLon, maxLon] = bbox.map(Number);
    return [
      [minLat - pad, minLon - pad],
      [maxLat + pad, maxLon + pad],
    ];
  }

  function boundsFromExtent(extent, pad = 0.002) {
    if (!extent || extent.length !== 4) {
      return null;
    }
    const [minLon, maxLat, maxLon, minLat] = extent.map(Number);
    return [
      [minLat - pad, minLon - pad],
      [maxLat + pad, maxLon + pad],
    ];
  }

  function formatPlaceType(item) {
    if (item.type) {
      return item.type.replace(/_/g, ' ');
    }
    if (item.category) {
      return item.category.replace(/_/g, ' ');
    }
    if (item.class) {
      return item.class.replace(/_/g, ' ');
    }
    return 'Place';
  }

  function buildDisplayName(parts) {
    return parts.filter(Boolean).join(', ');
  }

  function isInGermany(item) {
    const code = item.address?.country_code?.toLowerCase() || item.countrycode?.toLowerCase();
    if (code) {
      return code === GERMANY_COUNTRY_CODE;
    }
    const country = String(item.address?.country || item.country || item.display_name || '').toLowerCase();
    return country.includes('deutschland') || country.includes('germany');
  }

  function isExactPlaceName(name, term) {
    return String(name || '').trim().toLowerCase() === String(term || '').trim().toLowerCase();
  }

  function isRelevantPlaceType(type) {
    const normalized = String(type || '').toLowerCase();
    if (!normalized) {
      return true;
    }
    if (EXCLUDED_PLACE_TYPES.has(normalized)) {
      return false;
    }
    return true;
  }

  function isPlaceResult(item) {
    if (!item?.boundingbox || !isInGermany(item)) {
      return false;
    }

    const placeType = String(item.type || '').toLowerCase();
    const name = item.name || item.display_name?.split(',')[0]?.trim();

    if (item.class === 'building' || item.class === 'highway') {
      return false;
    }
    if (item.category === 'highway') {
      return false;
    }
    if (['natural', 'landuse', 'man_made', 'amenity'].includes(item.category)) {
      return false;
    }

    if (!isRelevantPlaceType(placeType)) {
      return false;
    }

    if (item.category === 'place' || item.class === 'place') {
      return true;
    }
    if (item.category === 'boundary' || item.class === 'boundary') {
      return true;
    }
    if (item.class === 'landuse') {
      return true;
    }

    const address = item.address || {};
    return Boolean(
      address.city ||
        address.town ||
        address.village ||
        address.suburb ||
        address.city_district ||
        address.state ||
        address.county
    );
  }

  function nominatimToArea(item) {
    const polygon = geoJsonToPolygon(item.geojson);
    const bounds =
      boundsFromBoundingBox(item.boundingbox?.map(Number)) ||
      (polygon ? computeBoundsFromPolygon(polygon) : null);

    if (!bounds) {
      return null;
    }

    const label = item.name || item.display_name?.split(',')[0]?.trim() || item.display_name;
    const placeType = formatPlaceType(item);
    const osmType = normalizeOsmType(item.osm_type);
    const osmId = item.osm_id;

    return {
      id: areaIdFromOsm(osmType, osmId) || `place:nominatim:${item.place_id}`,
      label,
      names: [label.toLowerCase(), ...(item.name ? [item.name.toLowerCase()] : [])],
      source: 'geocoder',
      placeType,
      displayName: item.display_name,
      shape: polygon?.length >= 3 ? 'polygon' : 'rectangle',
      polygon: polygon?.length >= 3 ? polygon : null,
      bounds,
      importance: Number(item.importance || 0),
      osmType,
      osmId,
    };
  }

  function photonToArea(feature) {
    const props = feature.properties || {};
    if (props.countrycode !== 'DE') {
      return null;
    }
    if (PHOTON_EXCLUDED_TYPES.has(props.type)) {
      return null;
    }
    if (props.osm_key && !PHOTON_ALLOWED_KEYS.has(props.osm_key)) {
      return null;
    }

    const placeType = props.osm_value || props.type || 'place';
    if (!isRelevantPlaceType(placeType)) {
      return null;
    }

    const label = props.name;
    if (!label) {
      return null;
    }

    const bounds =
      boundsFromExtent(props.extent) ||
      (feature.geometry?.coordinates
        ? boundsFromBoundingBox(
            [
              feature.geometry.coordinates[1] - 0.02,
              feature.geometry.coordinates[1] + 0.02,
              feature.geometry.coordinates[0] - 0.02,
              feature.geometry.coordinates[0] + 0.02,
            ],
            0
          )
        : null);

    if (!bounds) {
      return null;
    }

    const displayName = buildDisplayName([
      label,
      props.city || props.county,
      props.state,
      props.country || 'Deutschland',
    ]);

    return {
      id: areaIdFromOsm(props.osm_type, props.osm_id) || `place:photon:${label}:${displayName}`,
      label,
      names: [label.toLowerCase()],
      source: 'geocoder',
      placeType,
      displayName,
      shape: props.extent ? 'rectangle' : 'rectangle',
      polygon: null,
      bounds,
      importance: photonImportance(props),
      osmType: normalizeOsmType(props.osm_type),
      osmId: props.osm_id,
    };
  }

  function photonImportance(props) {
    let score = 0.3;
    const type = String(props.osm_value || props.type || '').toLowerCase();
    if (type === 'state') {
      score += 0.5;
    } else if (type === 'city' || type === 'town') {
      score += 0.45;
    } else if (['suburb', 'neighbourhood', 'neighborhood', 'quarter', 'borough', 'district'].includes(type)) {
      score += 0.35;
    } else if (type === 'administrative') {
      score += 0.4;
    } else if (type === 'village') {
      score += 0.25;
    }
    if (props.city) {
      score += 0.05;
    }
    return score;
  }

  function extractSearchQuery(inputValue) {
    const trimmed = String(inputValue || '').trim();
    if (!trimmed) {
      return '';
    }
    const areaMatch = trimmed.match(/^area:(.*)$/i);
    if (areaMatch) {
      return areaMatch[1].trim();
    }
    if (/^(type|in|area)(?::|$)/i.test(trimmed)) {
      return '';
    }
    return trimmed;
  }

  function extractAreaSuggestionQuery(inputValue) {
    const trimmed = String(inputValue || '').trim();
    if (!/^area(?::|$)/i.test(trimmed)) {
      return null;
    }
    return trimmed.replace(/^area:?/i, '').trim();
  }

  function getDefaultAreaSuggestions(partial = '') {
    const normalized = String(partial || '').trim().toLowerCase();
    if (!normalized) {
      return GERMANY_AREA_SUGGESTIONS.map((area) => ({ ...area }));
    }
    return GERMANY_AREA_SUGGESTIONS.filter(
      (area) =>
        area.label.toLowerCase().includes(normalized) ||
        area.displayName.toLowerCase().includes(normalized)
    ).map((area) => ({ ...area }));
  }

  async function searchAreaSuggestions(partial, options = {}) {
    const normalized = String(partial || '').trim();
    const defaults = getDefaultAreaSuggestions(normalized);
    let areas;

    if (normalized.length < 1) {
      areas = defaults;
    } else {
      const remote = await searchPlaces(normalized, { ...options, limit: options.limit || 15 });
      areas = mergeAreas(defaults, remote, normalized, options.limit || 15);
    }

    return enrichAreasWithPolygons(areas);
  }

  function pickBestMatchForTerm(results, term, displayHint = null) {
    if (!results?.length) {
      return null;
    }

    const normalized = String(term || '').trim().toLowerCase();
    const hint = String(displayHint || '').trim().toLowerCase();
    const withPolygon = results.filter((area) => area.polygon?.length >= 3);
    const pool = withPolygon.length ? withPolygon : results;

    if (hint) {
      const exactHint = pool.find((area) => area.displayName?.toLowerCase() === hint);
      if (exactHint) {
        return exactHint;
      }
      const hintCity = hint.split(',')[1]?.trim();
      if (hintCity) {
        const cityMatch = pool.find((area) => area.displayName?.toLowerCase().includes(hintCity));
        if (cityMatch) {
          return cityMatch;
        }
      }
    }

    return (
      pool.find((area) => area.label?.toLowerCase() === normalized) ||
      pool.find((area) => area.label?.toLowerCase().startsWith(normalized)) ||
      pool[0]
    );
  }

  async function enrichAreasWithPolygons(areas) {
    if (!areas?.length) {
      return [];
    }

    let enriched = await lookupPolygons(areas);
    const unresolved = enriched.filter((area) => !area.polygon?.length);
    if (unresolved.length === 0) {
      return enriched;
    }

    const resolvedPairs = await Promise.all(
      unresolved.map(async (area) => {
        const resolved = await resolveAreaBoundary(area);
        return [area.id, resolved];
      })
    );

    const resolvedById = new Map(
      resolvedPairs
        .filter(([, area]) => area?.polygon?.length >= 3)
        .map(([id, area]) => [id, area])
    );
    return enriched.map((area) => {
      const resolved = resolvedById.get(area.id);
      return resolved?.polygon?.length >= 3 ? resolved : area;
    });
  }

  async function resolveAreaBoundary(areaOrTerm, options = {}) {
    if (areaOrTerm?.polygon?.length >= 3) {
      return { ...areaOrTerm, shape: 'polygon' };
    }

    if (areaOrTerm?.source === 'drawn') {
      return areaOrTerm;
    }

    const term =
      typeof areaOrTerm === 'string'
        ? areaOrTerm.trim()
        : String(areaOrTerm?.label || areaOrTerm?.term || '').trim();
    const displayHint =
      options.displayName ||
      (typeof areaOrTerm === 'object' ? areaOrTerm.displayName : null) ||
      null;

    if (!term) {
      return typeof areaOrTerm === 'object' ? areaOrTerm : null;
    }

    const cacheKey = `${term.toLowerCase()}|${String(displayHint || '').toLowerCase()}|boundary`;
    if (resolveInflight.has(cacheKey)) {
      return resolveInflight.get(cacheKey);
    }

    const promise = (async () => {
      const cached = getCached(term);
      let best = pickBestMatchForTerm(cached, term, displayHint);
      if (best?.polygon?.length >= 3) {
        return best;
      }

      if (typeof areaOrTerm === 'object' && areaOrTerm.osmType && areaOrTerm.osmId) {
        const [lookedUp] = await lookupPolygons([areaOrTerm]);
        if (lookedUp?.polygon?.length >= 3) {
          return lookedUp;
        }
      }

      const searchHint = displayHint || `${term}, Deutschland`;
      const [searchResults, hintResults] = await Promise.all([
        searchPlaces(term, { ...options, limit: 8 }).catch(() => []),
        displayHint && displayHint !== `${term}, Deutschland`
          ? fetchNominatim(searchHint, { ...options, limit: 5 }).catch(() => [])
          : Promise.resolve([]),
      ]);

      best = pickBestMatchForTerm(
        mergeAreas([], [...searchResults, ...hintResults], term, 12),
        term,
        displayHint
      );
      if (best?.polygon?.length >= 3) {
        return best;
      }

      if (best) {
        const [resolved] = await lookupPolygons([best]);
        if (resolved?.polygon?.length >= 3) {
          return resolved;
        }
        return resolved || best;
      }

      return typeof areaOrTerm === 'object' ? areaOrTerm : null;
    })();

    resolveInflight.set(cacheKey, promise);
    try {
      return await promise;
    } finally {
      resolveInflight.delete(cacheKey);
    }
  }

  function scoreArea(area, term) {
    const normalized = String(term || '').trim().toLowerCase();
    const label = area.label?.toLowerCase() || '';
    const display = area.displayName?.toLowerCase() || '';
    let score = (area.importance || 0) * 100;

    if (label === normalized) {
      score += 100;
    } else if (label.startsWith(normalized)) {
      score += 60;
    } else if (label.includes(normalized)) {
      score += 30;
    } else if (display.includes(normalized)) {
      score += 15;
    }

    if (area.polygon?.length >= 3) {
      score += 45;
      if (label.includes(normalized) || label.startsWith(`${normalized}-`)) {
        score += 25;
      }
    }

    if (label === normalized && !area.polygon?.length) {
      score -= 25;
    }

    const type = String(area.placeType || '').toLowerCase();
    if (type === 'state' || type === 'administrative' && display.includes('deutschland') && !display.includes(',')) {
      score += 20;
    } else if (type === 'city' || type === 'town') {
      score += 18;
    } else if (['suburb', 'neighbourhood', 'neighborhood', 'quarter', 'borough', 'district'].includes(type)) {
      score += 15;
    } else if (type === 'village' || type === 'hamlet') {
      score += 8;
    }

    if (display.includes('deutschland')) {
      score += 5;
    }

    return score;
  }

  function rankAreas(areas, term) {
    return [...areas].sort((left, right) => scoreArea(right, term) - scoreArea(left, term));
  }

  async function fetchJson(url, headers = {}) {
    const response = await fetch(url, {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'investigation-explorer-demo/1.0',
        ...headers,
      },
    });
    if (!response.ok) {
      throw new Error(`Request failed (${response.status})`);
    }
    return response.json();
  }

  async function fetchPhoton(term, options = {}) {
    const params = new URLSearchParams({
      q: term,
      limit: String(options.limit || 20),
      lang: 'de',
      bbox: GERMANY_BBOX,
    });

    const data = await fetchJson(`${PHOTON_BASE}?${params.toString()}`);
    return (data.features || []).map(photonToArea).filter(Boolean);
  }

  async function fetchNominatim(query, options = {}) {
    const params = new URLSearchParams({
      q: query,
      format: 'jsonv2',
      polygon_geojson: '1',
      addressdetails: '1',
      limit: String(options.limit || 20),
      countrycodes: GERMANY_COUNTRY_CODE,
      dedupe: '1',
    });

    params.set('viewbox', options.viewbox || GERMANY_VIEWBOX);

    const results = await fetchJson(`${NOMINATIM_BASE}/search?${params.toString()}`);
    return (Array.isArray(results) ? results : [])
      .filter((item) => isPlaceResult(item))
      .map(nominatimToArea)
      .filter(Boolean);
  }

  async function lookupPolygons(areas) {
    const targets = areas.filter((area) => !area.polygon?.length && area.osmType && area.osmId);
    if (targets.length === 0) {
      return areas;
    }

    const osmIds = targets
      .slice(0, 12)
      .map((area) => `${area.osmType}${area.osmId}`)
      .join(',');

    try {
      const results = await fetchJson(
        `${NOMINATIM_BASE}/lookup?osm_ids=${encodeURIComponent(osmIds)}&format=jsonv2&polygon_geojson=1&addressdetails=1`
      );

      const polygonById = new Map();
      for (const item of Array.isArray(results) ? results : []) {
        const polygon = geoJsonToPolygon(item.geojson);
        if (!polygon?.length) {
          continue;
        }
        const id = areaIdFromOsm(item.osm_type, item.osm_id);
        if (id) {
          polygonById.set(id, {
            polygon,
            bounds:
              boundsFromBoundingBox(item.boundingbox?.map(Number)) ||
              computeBoundsFromPolygon(polygon),
            displayName: item.display_name,
            placeType: formatPlaceType(item),
            importance: Number(item.importance || 0),
          });
        }
      }

      return areas.map((area) => {
        const enrichment = polygonById.get(area.id);
        if (!enrichment) {
          return area;
        }
        return {
          ...area,
          polygon: enrichment.polygon,
          shape: 'polygon',
          bounds: enrichment.bounds || area.bounds,
          displayName: enrichment.displayName || area.displayName,
          placeType: enrichment.placeType || area.placeType,
          importance: Math.max(area.importance || 0, enrichment.importance || 0),
        };
      });
    } catch {
      return areas;
    }
  }

  function areaMatchesTerm(area, normalized) {
    if (!normalized) {
      return true;
    }
    if (area.label?.toLowerCase().includes(normalized)) {
      return true;
    }
    if (area.displayName?.toLowerCase().includes(normalized)) {
      return true;
    }
    return (area.names || []).some((name) => name.includes(normalized));
  }

  function mergeAreas(localAreas, remoteAreas, term, limit = 20) {
    const normalized = String(term || '').trim().toLowerCase();
    const merged = [];
    const seenIds = new Set();

    for (const area of [...localAreas, ...remoteAreas]) {
      if (!area?.id || seenIds.has(area.id)) {
        continue;
      }
      if (normalized && !areaMatchesTerm(area, normalized)) {
        continue;
      }
      seenIds.add(area.id);
      merged.push(area);
    }

    return rankAreas(merged, term).slice(0, limit);
  }

  async function searchPlaces(term, options = {}) {
    const normalized = String(term || '').trim();
    if (normalized.length < 2) {
      return [];
    }

    const cacheKey = `${normalized.toLowerCase()}|de`;
    if (cache.has(cacheKey) && !options.force) {
      return cache.get(cacheKey);
    }

    if (inflight?.key === cacheKey) {
      return inflight.promise;
    }

    const limit = options.limit || 20;

    const promise = (async () => {
      const searchOptions = { ...options, limit: Math.max(limit, 20), term: normalized };

      const [photonResults, nominatimResults, nominatimGermanyResults] = await Promise.all([
        fetchPhoton(normalized, searchOptions).catch(() => []),
        fetchNominatim(normalized, searchOptions).catch(() => []),
        fetchNominatim(`${normalized}, Deutschland`, searchOptions).catch(() => []),
      ]);

      let merged = mergeAreas(
        [],
        [...photonResults, ...nominatimResults, ...nominatimGermanyResults],
        normalized,
        Math.max(limit, 25)
      );

      merged = await lookupPolygons(merged);
      merged = rankAreas(merged, normalized).slice(0, limit);
      cache.set(cacheKey, merged);
      return merged;
    })()
      .catch(() => {
        cache.set(cacheKey, []);
        return [];
      })
      .finally(() => {
        if (inflight?.key === cacheKey) {
          inflight = null;
        }
      });

    inflight = { key: cacheKey, promise };
    return promise;
  }

  function getCached(term) {
    const cacheKey = `${String(term || '').trim().toLowerCase()}|de`;
    if (!cacheKey || cacheKey === '|de') {
      return [];
    }
    return cache.get(cacheKey) || [];
  }

  window.PlaceSearch = {
    searchPlaces,
    searchAreaSuggestions,
    resolveAreaBoundary,
    enrichAreasWithPolygons,
    extractSearchQuery,
    extractAreaSuggestionQuery,
    getDefaultAreaSuggestions,
    mergeAreas,
    nominatimToArea,
    photonToArea,
    areaMatchesTerm,
    getCached,
    GERMANY_VIEWBOX,
  };
})();
