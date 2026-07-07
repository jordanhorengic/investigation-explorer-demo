(function () {
  function normalizeTypeFilters(typeFilters, optionCount) {
    if (typeFilters instanceof Set) {
      if (typeFilters.size === 0 || typeFilters.size >= optionCount) {
        return null;
      }
      return typeFilters;
    }
    return null;
  }

  function passesTypeFilter(entity, typeFilters) {
    if (typeFilters instanceof Set && typeFilters.size > 0 && !typeFilters.has(entity.type)) {
      return false;
    }
    return true;
  }

  function collectHeatmapPoints(pins, options = {}) {
    const typeFilters = normalizeTypeFilters(options.typeFilters, options.optionCount ?? Infinity);
    const points = [];
    const seen = new Set();

    for (const pin of pins) {
      const entity = pin?.sourceEntity;
      if (!entity) {
        continue;
      }
      if (!passesTypeFilter(entity, typeFilters)) {
        continue;
      }
      if (!pin?.geo?.lat || !pin?.geo?.lon) {
        continue;
      }

      const key = `${pin.geo.lat.toFixed(5)}:${pin.geo.lon.toFixed(5)}:${entity.type}`;
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      points.push([pin.geo.lat, pin.geo.lon, 0.65]);
    }

    return points;
  }

  function createHeatLayer(points, options = {}) {
    if (!window.L?.heatLayer || points.length === 0) {
      return null;
    }

    return window.L.heatLayer(points, {
      radius: options.radius ?? 28,
      blur: options.blur ?? 20,
      minOpacity: 0.25,
      maxZoom: 17,
      max: 1,
      gradient: {
        0.2: '#3b82f6',
        0.45: '#22c55e',
        0.65: '#eab308',
        0.85: '#f97316',
        1: '#ef4444',
      },
    });
  }

  window.MapHeatmap = {
    collectHeatmapPoints,
    createHeatLayer,
    normalizeTypeFilters,
  };
})();
