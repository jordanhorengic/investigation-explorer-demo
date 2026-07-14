(function () {
  const { entities, relations, objectTypes } = window.INVESTIGATION_MOCK;
  const lookup = new Map(entities.map((entity) => [entity.id, entity]));
  const typeColors = Object.fromEntries(objectTypes.map((type) => [type.id, type.color]));
  const technicalNames = Object.fromEntries(objectTypes.map((type) => [type.id, type.technicalName]));

  const attributeCatalog = SearchFilters.buildAttributeCatalog(entities, objectTypes);

  const state = {
    selectedId: null,
    multiSelectedIds: new Set(),
    multiSelectAnchorId: null,
    pinnedIds: new Set(),
    pinSettings: new Map(),
    graphRoots: new Set(),
    searchTerm: '',
    searchFilters: SearchFilters.createDefault(objectTypes),
    vizSearchModalOpen: false,
    vizSearchSessionOpen: false,
    vizSearchContext: null,
    activeView: 'search',
    collapsedResultGroups: new Set(),
    mapHeatmap: {
      enabled: false,
      typeFilters: null,
    },
  };

  const graphState = GraphView.createGraphState();
  const graphViewport = { x: 0, y: 0, scale: 1 };
  let graphContextEntityId = null;
  let mapContextEntityId = null;
  let mapContextSelectionIds = [];
  let graphContextSelectionIds = [];
  const graphInteraction = {
    mode: null,
    nodeId: null,
    shiftKey: false,
    panStart: null,
    viewportStart: null,
    nodeOffset: null,
    dragMoved: false,
  };

  let map = null;
  let markerLayer = null;
  let areaLayer = null;
  let heatLayer = null;

  function ensureMap() {
    if (map) {
      return map;
    }

    map = L.map('map', { zoomControl: true }).setView([48.139, 11.565], 13);
    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
      attribution: '&copy; OpenStreetMap contributors &copy; CARTO',
      subdomains: 'abcd',
      maxZoom: 20,
    }).addTo(map);
    markerLayer = L.layerGroup().addTo(map);
    areaLayer = L.layerGroup().addTo(map);
    map.on('click', (event) => {
      hideMapContextMenu();
      if (event.originalEvent?.button !== 0) {
        return;
      }
      if (state.multiSelectedIds.size > 0) {
        clearMultiSelection();
        if (state.pinnedIds.size > 0) {
          renderMapPins({ preserveView: true });
        }
        refreshSearchResults();
      }
    });
    return map;
  }

  function refreshMapSize() {
    if (!map) {
      return;
    }

    requestAnimationFrame(() => {
      map.invalidateSize({ animate: false });
      requestAnimationFrame(() => map.invalidateSize({ animate: false }));
    });
  }

  const els = {
    search: document.getElementById('global-search'),
    vizSearchInput: document.getElementById('viz-search-input'),
    searchResults: document.getElementById('search-results'),
    vizSearchResults: document.getElementById('viz-search-results'),
    btnOpenMapSearch: document.getElementById('btn-open-map-search'),
    btnOpenGraphSearch: document.getElementById('btn-open-graph-search'),
    vizSearchModal: document.getElementById('viz-search-modal'),
    vizSearchBackdrop: document.getElementById('viz-search-backdrop'),
    vizSearchToolbar: document.getElementById('viz-search-toolbar'),
    vizSearchModalTitle: document.getElementById('viz-search-modal-title'),
    btnCloseVizSearch: document.getElementById('btn-close-viz-search'),
    objectTypeNav: document.getElementById('object-type-nav'),
    instancePanel: document.getElementById('instance-panel'),
    instancePanelActions: document.getElementById('instance-panel-actions'),
    instancePanelRelatedOptions: document.getElementById('instance-panel-related-options'),
    instanceBackdrop: document.getElementById('instance-backdrop'),
    inspectorIcon: document.getElementById('inspector-icon'),
    inspectorPhoto: document.getElementById('inspector-photo'),
    inspectorTitle: document.getElementById('inspector-title'),
    inspectorSubtitle: document.getElementById('inspector-subtitle'),
    inspectorId: document.getElementById('inspector-id'),
    inspectorAttributes: document.getElementById('inspector-attributes'),
    inspectorDocuments: document.getElementById('inspector-documents'),
    inspectorDocumentsCount: document.getElementById('inspector-documents-count'),
    inspectorDocumentsEmpty: document.getElementById('inspector-documents-empty'),
    inspectorRelated: document.getElementById('inspector-related'),
    inspectorRelatedCount: document.getElementById('inspector-related-count'),
    inspectorRelatedEmpty: document.getElementById('inspector-related-empty'),
    btnPinMap: document.getElementById('btn-pin-map'),
    btnAddGraph: document.getElementById('btn-add-graph'),
    btnClearMap: document.getElementById('btn-clear-map'),
    btnClosePanel: document.getElementById('btn-close-panel'),
    showRelatedObjects: document.getElementById('show-related-objects'),
    relatedObjectFilters: document.getElementById('related-object-filters'),
    relatedTypeFilters: document.getElementById('related-type-filters'),
    relatedTimePeriod: document.getElementById('related-time-period'),
    graphCaption: document.getElementById('graph-caption'),
    graphSvg: document.getElementById('graph-svg'),
    graphNodeTooltip: document.getElementById('graph-node-tooltip'),
    graphContextMenu: document.getElementById('graph-context-menu'),
    graphContextDetails: document.getElementById('graph-context-details'),
    graphContextExpand: document.getElementById('graph-context-expand'),
    graphContextMap: document.getElementById('graph-context-map'),
    graphContextRemove: document.getElementById('graph-context-remove'),
    btnGraphClear: document.getElementById('btn-graph-clear'),
    btnGraphZoomIn: document.getElementById('btn-graph-zoom-in'),
    btnGraphZoomOut: document.getElementById('btn-graph-zoom-out'),
    graphZoom: document.getElementById('graph-zoom'),
    mapLegend: document.getElementById('map-legend'),
    mapStatusBar: document.querySelector('.map-status-bar'),
    mapFrame: document.querySelector('.map-frame'),
    mapShowHeatmap: document.getElementById('map-show-heatmap'),
    mapHeatmapFilters: document.getElementById('map-heatmap-filters'),
    mapHeatmapTypeFilters: document.getElementById('map-heatmap-type-filters'),
    mapContextMenu: document.getElementById('map-context-menu'),
    mapContextDetails: document.getElementById('map-context-details'),
    mapContextRelated: document.getElementById('map-context-related'),
    mapContextGraph: document.getElementById('map-context-graph'),
    mapContextRemove: document.getElementById('map-context-remove'),
  };

  function defaultPinSettings() {
    return {
      showRelated: false,
      typeFilters: null,
      timePeriod: 'all',
    };
  }

  function getHeatmapTypeOptions() {
    const visibleTypes = new Set();
    for (const pin of collectMapPins()) {
      visibleTypes.add(pin.sourceEntity.type);
    }
    return objectTypes.filter((type) => visibleTypes.has(type.id));
  }

  function canEnableHeatmap() {
    return getHeatmapTypeOptions().length > 0;
  }

  function pruneHeatmapTypeFilters(typeFilters, options) {
    if (!(typeFilters instanceof Set) || options.length === 0) {
      return null;
    }

    const available = new Set(options.map((type) => type.id));
    const pruned = new Set([...typeFilters].filter((typeId) => available.has(typeId)));
    if (pruned.size === 0 || pruned.size >= options.length) {
      return null;
    }
    return pruned;
  }

  function syncHeatmapFromMapPins() {
    const enabled = canEnableHeatmap();
    const options = getHeatmapTypeOptions();

    if (els.mapStatusBar) {
      els.mapStatusBar.classList.toggle('hidden', !enabled);
    }

    els.mapShowHeatmap.disabled = !enabled;

    if (!enabled) {
      els.mapShowHeatmap.checked = false;
      state.mapHeatmap.enabled = false;
      state.mapHeatmap.typeFilters = null;
    } else {
      state.mapHeatmap.typeFilters = pruneHeatmapTypeFilters(state.mapHeatmap.typeFilters, options);
    }

    renderHeatmapTypeFilters(state.mapHeatmap.typeFilters);
    updateHeatmapFilterVisibility();
  }

  function normalizeHeatmapTypeFilters(typeFilters) {
    return MapHeatmap.normalizeTypeFilters(typeFilters, getHeatmapTypeOptions().length);
  }

  function readHeatmapTypeFiltersFromUI() {
    const options = getHeatmapTypeOptions();
    const selected = new Set();
    for (const input of els.mapHeatmapTypeFilters.querySelectorAll('input[type="checkbox"]')) {
      if (input.checked) {
        selected.add(input.value);
      }
    }
    if (selected.size === 0 || selected.size === options.length) {
      return null;
    }
    return selected;
  }

  function renderHeatmapTypeFilters(activeFilters) {
    const options = getHeatmapTypeOptions();
    const active = activeFilters instanceof Set ? activeFilters : null;
    const allActive = !active;

    els.mapHeatmapTypeFilters.innerHTML = '';
    if (options.length === 0) {
      return;
    }

    for (const type of options) {
      const checked = allActive || active.has(type.id);
      const label = document.createElement('label');
      label.className = `search-filter-chip${checked ? ' search-filter-chip--active' : ''}`;
      label.innerHTML = `
        <input type="checkbox" value="${type.id}" ${checked ? 'checked' : ''} />
        <span>${type.id}</span>
      `;
      label.querySelector('input').addEventListener('change', (event) => {
        label.classList.toggle('search-filter-chip--active', event.target.checked);
        applyHeatmapSettings();
      });
      els.mapHeatmapTypeFilters.appendChild(label);
    }
  }

  function updateHeatmapFilterVisibility() {
    els.mapHeatmapFilters.classList.toggle('hidden', !els.mapShowHeatmap.checked);
  }

  function renderHeatmapLayer() {
    ensureMap();

    if (heatLayer) {
      map.removeLayer(heatLayer);
      heatLayer = null;
    }

    if (!state.mapHeatmap.enabled || !canEnableHeatmap()) {
      return;
    }

    const points = MapHeatmap.collectHeatmapPoints(collectMapPins(), {
      typeFilters: state.mapHeatmap.typeFilters,
      optionCount: getHeatmapTypeOptions().length,
    });

    if (points.length === 0) {
      return;
    }

    heatLayer = MapHeatmap.createHeatLayer(points);
    if (heatLayer) {
      heatLayer.addTo(map);
    }
  }

  function applyHeatmapSettings() {
    state.mapHeatmap.enabled = els.mapShowHeatmap.checked;
    state.mapHeatmap.typeFilters = readHeatmapTypeFiltersFromUI();
    updateHeatmapFilterVisibility();
    renderHeatmapLayer();
  }

  function getMapRelatedTypeOptions() {
    return objectTypes.filter((type) => type.id !== 'Location');
  }

  function normalizePinTypeFilters(settings) {
    if (settings.typeFilters instanceof Set) {
      const optionCount = getMapRelatedTypeOptions().length;
      if (settings.typeFilters.size === 0 || settings.typeFilters.size >= optionCount) {
        return null;
      }
      return new Set(settings.typeFilters);
    }
    if (settings.typeFilter && settings.typeFilter !== 'all') {
      return new Set([settings.typeFilter]);
    }
    return null;
  }

  function readRelatedTypeFiltersFromUI() {
    const options = getMapRelatedTypeOptions();
    const selected = new Set();
    for (const input of els.relatedTypeFilters.querySelectorAll('input[type="checkbox"]')) {
      if (input.checked) {
        selected.add(input.value);
      }
    }
    if (selected.size === 0 || selected.size === options.length) {
      return null;
    }
    return selected;
  }

  function renderRelatedTypeFilters(activeFilters) {
    const options = getMapRelatedTypeOptions();
    const active = activeFilters instanceof Set ? activeFilters : null;
    const allActive = !active;

    els.relatedTypeFilters.innerHTML = '';
    for (const type of options) {
      const checked = allActive || active.has(type.id);
      const label = document.createElement('label');
      label.className = `search-filter-chip${checked ? ' search-filter-chip--active' : ''}`;
      label.innerHTML = `
        <input type="checkbox" value="${type.id}" ${checked ? 'checked' : ''} />
        <span>${type.id}</span>
      `;
      label.querySelector('input').addEventListener('change', (event) => {
        label.classList.toggle('search-filter-chip--active', event.target.checked);
        applyRelatedOptionsForSelection();
      });
      els.relatedTypeFilters.appendChild(label);
    }
  }

  function getPinSettings(entityId) {
    return state.pinSettings.get(entityId) || defaultPinSettings();
  }

  function updateRelatedFilterVisibility() {
    els.relatedObjectFilters.classList.toggle('hidden', !els.showRelatedObjects.checked);
  }

  function syncRelatedOptionsFromSelection() {
    if (!state.selectedId) {
      els.showRelatedObjects.checked = false;
      els.relatedTimePeriod.value = 'all';
      renderRelatedTypeFilters(null);
      updateRelatedFilterVisibility();
      return;
    }

    const settings = getPinSettings(state.selectedId);
    els.showRelatedObjects.checked = settings.showRelated;
    els.relatedTimePeriod.value = settings.timePeriod;
    renderRelatedTypeFilters(normalizePinTypeFilters(settings));
    updateRelatedFilterVisibility();
  }

  function findGraphAnchorForEntity(entityId) {
    for (const rootId of state.graphRoots) {
      for (const rel of relations) {
        if (
          (rel.from === rootId && rel.to === entityId) ||
          (rel.to === rootId && rel.from === entityId)
        ) {
          return rootId;
        }
      }
    }

    for (const rel of relations) {
      const otherId = rel.from === entityId ? rel.to : rel.to === entityId ? rel.from : null;
      if (otherId && graphState.nodeIds.has(otherId)) {
        return otherId;
      }
    }

    return [...state.graphRoots][0] || null;
  }

  function computeGraphNodeSet() {
    const nodeIds = new Set(state.graphRoots);

    for (const rootId of state.graphRoots) {
      const settings = getPinSettings(rootId);
      if (!settings.showRelated) {
        continue;
      }

      const rootEntity = lookup.get(rootId);
      if (!rootEntity) {
        continue;
      }

      const related = MapLocations.collectRelatedEntities(rootEntity, lookup, relations, 2, {
        typeFilters: normalizePinTypeFilters(settings),
        timePeriod: settings.timePeriod,
      });

      for (const entry of related) {
        nodeIds.add(entry.entity.id);
      }
    }

    return nodeIds;
  }

  function syncGraphRelatedObjects() {
    if (state.graphRoots.size === 0) {
      return;
    }

    const desired = computeGraphNodeSet();
    const toRemove = [...graphState.nodeIds].filter((id) => !desired.has(id));
    const toAdd = [...desired].filter((id) => !graphState.nodeIds.has(id));

    for (const id of toRemove) {
      GraphView.removeNode(graphState, id);
    }

    for (const id of toAdd) {
      const anchorId = findGraphAnchorForEntity(id);
      GraphView.addNode(
        graphState,
        id,
        lookup,
        anchorId ? { anchorId, neighborIndex: graphState.nodeIds.size, neighborTotal: toAdd.length + 1 } : {}
      );
    }

    graphState.links = [];
    graphState.linkKeys.clear();
    for (const rel of relations) {
      if (desired.has(rel.from) && desired.has(rel.to)) {
        GraphView.addLink(graphState, rel.from, rel.to, rel.label);
      }
    }

    GraphView.resolveOverlaps(graphState);
    renderGraphView();
  }

  function applyRelatedOptionsForSelection() {
    if (!state.selectedId) {
      return;
    }

    state.pinSettings.set(state.selectedId, {
      showRelated: els.showRelatedObjects.checked,
      typeFilters: readRelatedTypeFiltersFromUI(),
      timePeriod: els.relatedTimePeriod.value,
    });

    updateRelatedFilterVisibility();

    if (state.activeView === 'map') {
      if (!state.pinnedIds.has(state.selectedId)) {
        if (els.showRelatedObjects.checked) {
          pinEntityOnMap(state.selectedId, { stayOnMap: true, showRelated: true });
        }
        return;
      }

      renderMapPins();
      return;
    }

    if (state.activeView === 'graph') {
      if (!graphState.nodeIds.has(state.selectedId)) {
        if (els.showRelatedObjects.checked) {
          appendEntityToGraph(state.selectedId, { stayOnGraph: true });
        } else {
          return;
        }
      }

      if (!state.graphRoots.has(state.selectedId)) {
        state.graphRoots.add(state.selectedId);
      }

      syncGraphRelatedObjects();
    }
  }

  function pinEntityOnMap(entityId, options = {}) {
    if (!lookup.has(entityId)) {
      return false;
    }

    state.pinnedIds.add(entityId);
    if (!state.pinSettings.has(entityId)) {
      state.pinSettings.set(entityId, defaultPinSettings());
    }
    if (options.showRelated) {
      state.pinSettings.set(entityId, {
        ...getPinSettings(entityId),
        showRelated: true,
        typeFilters: options.typeFilters ?? readRelatedTypeFiltersFromUI(),
        timePeriod: options.timePeriod || els.relatedTimePeriod.value,
      });
    }
    state.selectedId = entityId;
    syncRelatedOptionsFromSelection();
    ensureMap();
    if (!options.skipRender) {
      renderMapPins(options);
      refreshSearchResults();
    }
    if (!options.stayOnMap && !options.skipRender) {
      switchView('map');
    }
    return true;
  }

  function unpinEntityFromMap(entityId, options = {}) {
    if (!state.pinnedIds.has(entityId)) {
      return false;
    }

    state.pinnedIds.delete(entityId);
    state.pinSettings.delete(entityId);
    ensureMap();
    if (!options.skipRender) {
      renderMapPins({ preserveView: true });
      refreshSearchResults();
    }
    return true;
  }

  function removeEntitiesFromMap(entityIds) {
    const ids = [...new Set(entityIds)];
    let removed = 0;

    for (const entityId of ids) {
      if (unpinEntityFromMap(entityId, { skipRender: true })) {
        removed += 1;
      }
    }

    if (removed === 0) {
      return;
    }

    for (const entityId of ids) {
      state.multiSelectedIds.delete(entityId);
    }

    if (state.selectedId && ids.includes(state.selectedId)) {
      state.selectedId = null;
      closeInstancePanel();
    }

    renderMapPins({ preserveView: true });
    afterVizRemove('map');
  }

  function removeEntitiesFromGraph(entityIds) {
    const ids = [...new Set(entityIds)];
    let removed = 0;

    for (const entityId of ids) {
      if (removeEntityFromGraph(entityId, { skipRender: true })) {
        removed += 1;
      }
    }

    if (removed === 0) {
      return;
    }

    for (const entityId of ids) {
      state.multiSelectedIds.delete(entityId);
    }

    if (state.selectedId && ids.includes(state.selectedId)) {
      state.selectedId = null;
      closeInstancePanel();
    }

    renderGraphView();
    afterVizRemove('graph');
  }

  function appendEntityToGraph(entityId, options = {}) {
    const entity = lookup.get(entityId);
    if (!entity) {
      return false;
    }

    if (!graphState.nodeIds.has(entityId)) {
      const anchorId =
        options.anchorId ||
        (graphState.seedId && graphState.nodeIds.has(graphState.seedId) ? graphState.seedId : null) ||
        [...graphState.nodeIds][0] ||
        null;
      GraphView.addNode(
        graphState,
        entityId,
        lookup,
        anchorId
          ? {
              anchorId,
              neighborIndex: options.neighborIndex,
              neighborTotal: options.neighborTotal,
            }
          : {}
      );
    }

    state.graphRoots.add(entityId);
    state.selectedId = entityId;

    if (!options.skipRender) {
      renderGraphView();
      refreshSearchResults();
    }

    if (options.showRelated) {
      syncGraphRelatedObjects();
    }

    if (options.openDetails) {
      renderInspector(entity);
    }

    if (options.switchView) {
      switchView('graph');
    }

    return true;
  }

  function clearMultiSelection() {
    state.multiSelectedIds.clear();
    state.multiSelectAnchorId = null;
  }

  function isMultiSelected(entityId) {
    return state.multiSelectedIds.has(entityId);
  }

  function getContextSelectionIds() {
    if (state.multiSelectedIds.size > 0) {
      return resolveBulkEntityIds([...state.multiSelectedIds]);
    }
    return state.selectedId ? resolveBulkEntityIds([state.selectedId]) : [];
  }

  function toggleMultiSelection(entityId) {
    if (state.multiSelectedIds.has(entityId)) {
      state.multiSelectedIds.delete(entityId);
    } else {
      state.multiSelectedIds.add(entityId);
    }
    state.multiSelectAnchorId = entityId;
    state.selectedId = entityId;
  }

  function setMultiSelectionRange(flatIds, entityId) {
    const anchor = state.multiSelectAnchorId;
    if (!anchor || !flatIds.includes(anchor)) {
      state.multiSelectedIds.clear();
      state.multiSelectedIds.add(entityId);
      state.multiSelectAnchorId = entityId;
      state.selectedId = entityId;
      return;
    }

    const start = flatIds.indexOf(anchor);
    const end = flatIds.indexOf(entityId);
    const from = Math.min(start, end);
    const to = Math.max(start, end);
    state.multiSelectedIds.clear();
    for (let index = from; index <= to; index += 1) {
      state.multiSelectedIds.add(flatIds[index]);
    }
    state.selectedId = entityId;
  }

  function applySelection(entityId, { shiftKey = false, flatIds = null } = {}) {
    if (shiftKey && flatIds) {
      setMultiSelectionRange(flatIds, entityId);
      return;
    }

    if (shiftKey) {
      toggleMultiSelection(entityId);
      return;
    }

    clearMultiSelection();
    state.multiSelectedIds.add(entityId);
    state.multiSelectAnchorId = entityId;
    state.selectedId = entityId;
  }

  function resolveBulkEntityIds(entityIds) {
    const seen = new Set();
    const resolved = [];
    for (const entityId of entityIds) {
      if (!entityId || seen.has(entityId) || !lookup.has(entityId)) {
        continue;
      }
      seen.add(entityId);
      resolved.push(entityId);
    }
    return resolved;
  }

  function captureSelectionSnapshot(fallbackEntityId = null) {
    if (state.multiSelectedIds.size > 0) {
      return resolveBulkEntityIds([...state.multiSelectedIds]);
    }
    if (fallbackEntityId) {
      return resolveBulkEntityIds([fallbackEntityId]);
    }
    return state.selectedId ? resolveBulkEntityIds([state.selectedId]) : [];
  }

  function prepareContextSelection(entityId) {
    if (state.multiSelectedIds.size > 1) {
      if (!state.multiSelectedIds.has(entityId)) {
        state.multiSelectedIds.add(entityId);
      }
      state.selectedId = entityId;
      state.multiSelectAnchorId = entityId;
      return;
    }

    clearMultiSelection();
    state.multiSelectedIds.add(entityId);
    state.selectedId = entityId;
    state.multiSelectAnchorId = entityId;
  }

  function isSelectionHighlighted(entityId) {
    if (state.multiSelectedIds.size > 0) {
      return state.multiSelectedIds.has(entityId);
    }
    return state.selectedId === entityId;
  }

  function refreshSelectionViews() {
    refreshSearchResults();
    if (state.pinnedIds.size > 0 || state.activeView === 'map') {
      renderMapPins({ preserveView: true });
    }
    if (graphState.nodeIds.size > 0) {
      renderGraphView();
    }
  }

  function getFlatResultIds(context) {
    const items = runSearch();
    if (context !== 'map' && context !== 'graph') {
      return items.map((entity) => entity.id);
    }

    const flat = [];
    for (const group of groupResultsByType(items)) {
      if (state.collapsedResultGroups.has(group.type)) {
        continue;
      }
      for (const entity of group.items) {
        flat.push(entity.id);
      }
    }
    return flat;
  }

  function pinEntitiesOnMap(entityIds, options = {}) {
    const ids = resolveBulkEntityIds(entityIds);
    for (const entityId of ids) {
      state.pinnedIds.add(entityId);
      if (!state.pinSettings.has(entityId)) {
        state.pinSettings.set(entityId, defaultPinSettings());
      }
      if (options.showRelated) {
        state.pinSettings.set(entityId, {
          ...getPinSettings(entityId),
          showRelated: true,
          typeFilters: options.typeFilters ?? readRelatedTypeFiltersFromUI(),
          timePeriod: options.timePeriod || els.relatedTimePeriod.value,
        });
      }
    }

    if (ids.length > 0) {
      state.selectedId = ids[ids.length - 1];
      syncRelatedOptionsFromSelection();
    }

    ensureMap();
    renderMapPins({ preserveView: true, ...options });
    refreshSearchResults();

    if (options.switchView !== false) {
      switchView('map');
    }
  }

  function addEntitiesToGraph(entityIds, options = {}) {
    const ids = resolveBulkEntityIds(entityIds);
    let batchAnchor =
      graphState.seedId && graphState.nodeIds.has(graphState.seedId)
        ? graphState.seedId
        : [...graphState.nodeIds][0] || null;

    for (let index = 0; index < ids.length; index += 1) {
      const entityId = ids[index];
      const nodeOptions = {
        ...options,
        openDetails: false,
        switchView: false,
        skipRender: true,
      };

      if (batchAnchor) {
        nodeOptions.anchorId = batchAnchor;
        nodeOptions.neighborIndex = index;
        nodeOptions.neighborTotal = ids.length;
      }

      appendEntityToGraph(entityId, nodeOptions);

      if (!batchAnchor && graphState.nodeIds.has(entityId)) {
        batchAnchor = entityId;
      }
    }

    if (ids.length > 0) {
      state.selectedId = ids[ids.length - 1];
    }
    renderGraphView();
    refreshSearchResults();
    if (options.switchView !== false) {
      switchView('graph');
    }
  }

  function relatedEntities(entityId) {
    const related = [];
    for (const rel of relations) {
      if (rel.from === entityId) {
        related.push({ entity: lookup.get(rel.to), label: rel.label });
      } else if (rel.to === entityId) {
        related.push({ entity: lookup.get(rel.from), label: rel.label });
      }
    }
    return related.filter((entry) => entry.entity);
  }

  function runSearch(term = state.searchTerm) {
    return SearchFilters.filterEntities(entities, term, state.searchFilters, objectTypes, lookup);
  }

  function hasSearchCriteria() {
    return SearchFilters.hasActiveCriteria(state.searchTerm, state.searchFilters, objectTypes.length);
  }

  function shouldShowContextResults(context) {
    if (!hasSearchCriteria()) {
      return false;
    }
    if (context === 'search') {
      return true;
    }
    if (context === 'map' || context === 'graph') {
      if (VizSearchVariant.isModal()) {
        return state.vizSearchModalOpen && state.vizSearchContext === context;
      }
      if (state.activeView !== context) {
        return false;
      }
      if (VizSearchVariant.get() === 'strip') {
        return VizSearchVariant.isResultsExpanded();
      }
      if (VizSearchVariant.get() === 'dock') {
        return !VizSearchVariant.isDockCollapsed();
      }
      if (VizSearchVariant.needsExplicitOpen()) {
        return state.vizSearchSessionOpen && VizSearchVariant.isResultsExpanded();
      }
      return true;
    }
    return true;
  }

  function finishVizSearchSession(options = {}) {
    const clearSearch = options.clearSearch !== false;
    if (VizSearchVariant.isModal()) {
      closeVizSearchModal({ clearSearch });
      return;
    }
    state.vizSearchSessionOpen = false;
    VizSearchVariant.updateOpenState(false, state.vizSearchContext);
    if (clearSearch) {
      state.searchTerm = '';
      SmartSearchBar.syncAll();
    }
    refreshSearchResults();
  }

  function afterVizAdd(context) {
    if (VizSearchVariant.isPersistent()) {
      refreshSearchResults();
      VizSearchVariant.showToast(context === 'map' ? 'Added to map' : 'Added to graph');
      requestAnimationFrame(() => els.vizSearchInput?.focus());
      return;
    }
    finishVizSearchSession({ clearSearch: true });
  }

  function afterVizRemove(context) {
    if (VizSearchVariant.isPersistent()) {
      refreshSearchResults();
      VizSearchVariant.showToast(context === 'map' ? 'Removed from map' : 'Removed from graph');
      requestAnimationFrame(() => els.vizSearchInput?.focus());
      return;
    }
    refreshSearchResults();
  }

  function closeVizSearchModal(options = {}) {
    const wasOpen = state.vizSearchModalOpen;
    state.vizSearchModalOpen = false;
    state.vizSearchContext = null;
    els.vizSearchModal.classList.add('hidden');
    els.vizSearchModal.setAttribute('aria-hidden', 'true');

    if (options.clearSearch) {
      state.searchTerm = '';
      SmartSearchBar.syncAll();
    }

    if (wasOpen) {
      refreshSearchResults();
    }
  }

  function openVizSearch(context) {
    state.vizSearchContext = context;
    if (VizSearchVariant.isModal()) {
      openVizSearchModal(context);
      return;
    }

    state.vizSearchSessionOpen = true;
    VizSearchVariant.mountTo(context);
    const shell = document.getElementById('viz-add-shell');
    if (shell) {
      shell.dataset.title = VizSearchVariant.contextTitle(context);
    }

    if (VizSearchVariant.get() === 'strip') {
      VizSearchVariant.setResultsExpanded(true);
    } else if (VizSearchVariant.get() === 'dock' && VizSearchVariant.isDockCollapsed()) {
      VizSearchVariant.setDockCollapsed(false);
    } else {
      VizSearchVariant.updateOpenState(true, context);
    }

    SmartSearchBar.syncAll();
    refreshSearchResults();
    requestAnimationFrame(() => els.vizSearchInput?.focus());
  }

  function openVizSearchModal(context) {
    state.vizSearchModalOpen = true;
    state.vizSearchContext = context;
    els.vizSearchModalTitle.textContent = context === 'map' ? 'Add to map' : 'Add to graph';
    els.vizSearchModal.classList.remove('hidden');
    els.vizSearchModal.setAttribute('aria-hidden', 'false');
    SmartSearchBar.syncAll();
    refreshSearchResults();
    requestAnimationFrame(() => els.vizSearchInput?.focus());
  }

  function collapseMapSearch() {
    finishVizSearchSession({ clearSearch: true });
  }

  function collapseGraphSearch() {
    finishVizSearchSession({ clearSearch: true });
  }

  function activateVizSearchForView(viewName) {
    if (viewName !== 'map' && viewName !== 'graph') {
      return;
    }
    if (VizSearchVariant.isModal()) {
      return;
    }
    state.vizSearchContext = viewName;
    state.vizSearchSessionOpen = true;
    VizSearchVariant.mountTo(viewName);
    const shell = document.getElementById('viz-add-shell');
    if (shell) {
      shell.dataset.title = VizSearchVariant.contextTitle(viewName);
    }

    if (VizSearchVariant.get() === 'dropdown') {
      state.vizSearchSessionOpen = false;
      VizSearchVariant.updateOpenState(false, viewName);
      return;
    }
  }

  function pruneFiltersForSelectedTypes(filters) {
    const availableFields = new Set(SearchFilters.getAvailableFields(attributeCatalog, filters.types));

    if (filters.searchFields) {
      filters.searchFields = new Set(
        [...filters.searchFields].filter((fieldId) => availableFields.has(fieldId))
      );
      if (filters.searchFields.size === 0) {
        filters.searchFields = null;
      }
    }

    filters.attributeRules = filters.attributeRules.filter((rule) => rule.fieldId);
  }

  function handleSmartSearchChange() {
    SmartSearchBar.syncAll();
    refreshSearchResults();
  }

  function setTypeFilter(typeId) {
    state.searchFilters.types = new Set([typeId]);
    pruneFiltersForSelectedTypes(state.searchFilters);
    SmartSearchBar.syncAll();
    refreshSearchResults();
  }

  const SIDEBAR_EXCLUDED_TYPES = new Set([
    'Location',
    'Organisation',
    'Identity Record',
    'Person',
    'Case File',
    'Criminal Offence',
    'Regulatory Offence',
    'Traffic Accident',
    'Motor Vehicle',
    'Firearm',
    'Police Measure',
    'Documents',
    'Tip and Lead',
    'Physical Description',
    'Case Event',
  ]);

  function renderObjectTypeNav() {
    els.objectTypeNav.innerHTML = '';
    let visibleCount = 0;
    for (const type of objectTypes) {
      if (SIDEBAR_EXCLUDED_TYPES.has(type.id)) {
        continue;
      }
      visibleCount += 1;
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'package-object-item';
      button.innerHTML = `
        <span class="package-object-item__icon">${ObjectIcons.iconMarkup(type.id, { size: 14, color: 'var(--accent)' })}</span>
        <span>${type.id}</span>
      `;
      button.addEventListener('click', () => {
        setTypeFilter(type.id);
        switchView('search');
        els.search.focus();
      });
      els.objectTypeNav.appendChild(button);
    }
    els.objectTypeNav.style.display = visibleCount > 0 ? '' : 'none';
  }

  function syncSearchInputs() {
    SmartSearchBar.syncAll();
  }

  function setSearchTerm(term) {
    state.searchTerm = term;
    SmartSearchBar.syncAll();
    refreshSearchResults();
  }

  function handleSearchResultSelect(entityId, context, event) {
    const shiftKey = event?.shiftKey === true;
    const flatIds =
      (context === 'map' || context === 'graph') && shouldShowContextResults(context)
        ? getFlatResultIds(context)
        : null;

    if (context === 'search') {
      selectEntity(entityId);
      return;
    }

    applySelection(entityId, { shiftKey, flatIds });

    if (shiftKey) {
      refreshSelectionViews();
      return;
    }

    if (context === 'map') {
      if (state.pinnedIds.has(entityId)) {
        unpinEntityFromMap(entityId);
        afterVizRemove('map');
      } else {
        pinEntityOnMap(entityId, { stayOnMap: true });
        afterVizAdd('map');
      }
      return;
    }

    if (context === 'graph') {
      if (graphState.nodeIds.has(entityId)) {
        removeEntityFromGraph(entityId);
        afterVizRemove('graph');
      } else {
        addToGraph(entityId, { openDetails: false });
        afterVizAdd('graph');
      }
    }
  }

  function groupResultsByType(items) {
    const byType = new Map(objectTypes.map((type) => [type.id, []]));
    for (const entity of items) {
      if (!byType.has(entity.type)) {
        byType.set(entity.type, []);
      }
      byType.get(entity.type).push(entity);
    }
    return objectTypes
      .map((type) => ({ type: type.id, items: byType.get(type.id) || [] }))
      .filter((group) => group.items.length > 0);
  }

  function toggleResultGroup(typeId) {
    if (state.collapsedResultGroups.has(typeId)) {
      state.collapsedResultGroups.delete(typeId);
    } else {
      state.collapsedResultGroups.add(typeId);
    }
    refreshSearchResults();
  }

  function buildResultCard(entity, context, options = {}) {
    const groupedList = options.groupedList === true;
    const highlighted = isSelectionHighlighted(entity.id);
    const card = document.createElement('div');
    const match = SearchFilters.resolveResultMatch(entity, state.searchTerm, state.searchFilters, lookup);
    const onMap = state.pinnedIds.has(entity.id);
    const onGraph = graphState.nodeIds.has(entity.id);
    const color = typeColors[entity.type] || '#1b44b1';

    if (groupedList) {
      let status = '';
      let onViz = false;
      if (context === 'map' && onMap) {
        status = '<span class="result-row__status">On map</span>';
        onViz = true;
      } else if (context === 'graph' && onGraph) {
        status = '<span class="result-row__status">On graph</span>';
        onViz = true;
      }

      card.className = `result-row${highlighted ? ' result-row--selected' : ''}${
        context === 'map' && onMap ? ' result-row--on-map' : ''
      }${context === 'graph' && onGraph ? ' result-row--on-graph' : ''}`;
      if (onViz) {
        card.title = 'Click to remove';
      }

      card.innerHTML = `
        <span class="result-row__icon">${ObjectIcons.iconMarkup(entity.type, { size: 18, color })}</span>
        <div class="result-row__content">
          <div class="result-row__title">${DisplayNames.displayName(entity, lookup)}</div>
          <div class="result-row__match">${match.fieldId}: ${match.value}</div>
        </div>
        ${status}
      `;
      card.addEventListener('click', (event) => handleSearchResultSelect(entity.id, context, event));
      if (context === 'map' || context === 'graph') {
        card.addEventListener('contextmenu', (event) => {
          event.preventDefault();
          const selectionSnapshot = captureSelectionSnapshot(entity.id);
          if (context === 'map') {
            showMapContextMenu(entity.id, event.clientX, event.clientY, selectionSnapshot);
          } else {
            showGraphContextMenu(entity.id, event.clientX, event.clientY, selectionSnapshot);
          }
        });
      }
      return card;
    }

    card.className = `result-card${highlighted ? ' selected' : ''}`;

    let footer = '';
    if (context === 'search') {
      footer = `
        <div class="result-card__actions">
          <button class="btn btn-outline btn-sm result-card__add-graph" type="button">Add to graph</button>
        </div>
      `;
    } else if (context === 'map' && onMap) {
      footer = '<span class="result-card__status">On map</span>';
    } else if (context === 'graph' && onGraph) {
      footer = '<span class="result-card__status">On graph</span>';
    }

    card.innerHTML = `
      <div class="result-card__head">
        <span class="result-card__icon">${ObjectIcons.iconMarkup(entity.type, { size: 20, color })}</span>
        <div class="result-card__body">
          <div class="result-card-title">${DisplayNames.displayName(entity, lookup)}</div>
          <div class="result-card-sub">${entity.id}</div>
          <div class="result-card-match">${match.fieldId}: ${match.value}</div>
          <span class="result-card-type">${entity.type}</span>
          ${footer}
        </div>
      </div>
    `;

    card.addEventListener('click', (event) => handleSearchResultSelect(entity.id, context, event));

    const addGraphButton = card.querySelector('.result-card__add-graph');
    if (addGraphButton) {
      addGraphButton.addEventListener('click', (event) => {
        event.stopPropagation();
        addToGraph(entity.id, { switchView: true });
      });
    }

    return card;
  }

  function renderGroupedSearchResults(items, container, context) {
    const isVizResults = container.id === 'viz-search-results';
    const keepHidden = isVizResults && container.classList.contains('hidden');
    container.className = isVizResults
      ? 'search-results search-results--grouped viz-add-shell__results'
      : 'search-results search-results--grouped';
    if (keepHidden) {
      container.classList.add('hidden');
    }
    container.innerHTML = '';

    if (!shouldShowContextResults(context)) {
      return;
    }

    if (items.length === 0) {
      const variant = hasSearchCriteria() ? 'search-no-results' : 'search-idle';
      container.innerHTML = EmptyStates.render(variant, { context });
      return;
    }

    for (const group of groupResultsByType(items)) {
      const section = document.createElement('section');
      section.className = 'search-result-group';
      const collapsed = state.collapsedResultGroups.has(group.type);
      const color = typeColors[group.type] || '#1b44b1';

      const header = document.createElement('button');
      header.type = 'button';
      header.className = 'search-result-group__header';
      header.setAttribute('aria-expanded', String(!collapsed));
      header.innerHTML = `
        <span class="search-result-group__chevron${collapsed ? ' search-result-group__chevron--collapsed' : ''}" aria-hidden="true">▾</span>
        <span class="search-result-group__type-icon">${ObjectIcons.iconMarkup(group.type, { size: 16, color })}</span>
        <span class="search-result-group__label">${group.type}</span>
        <span class="search-result-group__count">(${group.items.length})</span>
      `;
      header.addEventListener('click', () => toggleResultGroup(group.type));

      const body = document.createElement('div');
      body.className = 'search-result-group__body';
      body.hidden = collapsed;

      for (const entity of group.items) {
        body.appendChild(buildResultCard(entity, context, { groupedList: true }));
      }

      section.appendChild(header);
      section.appendChild(body);
      container.appendChild(section);
    }
  }

  function renderSearchResults(items, container, context) {
    renderGroupedSearchResults(items, container, context);
  }

  function formatAttributeValue(value) {
    if (value === null || value === undefined || value === '') {
      return '—';
    }
    const text = String(value);
    const parsed = Date.parse(text);
    if (!Number.isNaN(parsed) && /^\d{4}-\d{2}-\d{2}/.test(text)) {
      return text.includes('T')
        ? new Date(parsed).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' })
        : new Date(parsed).toLocaleDateString('de-DE');
    }
    return text;
  }

  function updateInspectorPanelContext() {
    const onMap = state.activeView === 'map';
    const onGraph = state.activeView === 'graph';
    const showPin = !onMap;
    const showGraph = !onGraph;

    els.btnPinMap.classList.toggle('hidden', !showPin);
    els.btnAddGraph.classList.toggle('hidden', !showGraph);
    els.instancePanelActions.classList.toggle('hidden', !showPin && !showGraph);
    els.instancePanelRelatedOptions.classList.toggle('hidden', !onMap && !onGraph);
  }

  function openInstancePanel() {
    els.instancePanel.classList.add('open');
    els.instancePanel.setAttribute('aria-hidden', 'false');
    els.instanceBackdrop.classList.remove('hidden');
    els.instanceBackdrop.setAttribute('aria-hidden', 'false');
  }

  function closeInstancePanel() {
    els.instancePanel.classList.remove('open');
    els.instancePanel.setAttribute('aria-hidden', 'true');
    els.instanceBackdrop.classList.add('hidden');
    els.instanceBackdrop.setAttribute('aria-hidden', 'true');
  }

  function renderInspector(entity) {
    if (!entity) {
      closeInstancePanel();
      return;
    }

    openInstancePanel();

    const technicalName = technicalNames[entity.type] || entity.type;
    const color = typeColors[entity.type] || '#1b44b1';

    els.inspectorIcon.innerHTML = ObjectIcons.iconMarkup(entity.type, {
      size: 22,
      color: color,
    });
    els.inspectorIcon.style.background = `${color}20`;
    EntityAttachments.renderPersonPhoto(els.inspectorPhoto, els.inspectorIcon, entity);
    els.inspectorTitle.textContent = DisplayNames.displayName(entity, lookup);
    els.inspectorSubtitle.textContent = `${entity.type} · ${technicalName}`;
    els.inspectorId.textContent = entity.id;

    const attributeRows = [{ fieldId: 'ID', value: entity.id, isKey: true }];
    for (const [fieldId, value] of Object.entries(entity.attributes || {})) {
      attributeRows.push({ fieldId, value, isKey: fieldId.endsWith('_ID') });
    }
    attributeRows.sort((a, b) => {
      if (a.fieldId === 'ID') {
        return -1;
      }
      if (b.fieldId === 'ID') {
        return 1;
      }
      return a.fieldId.localeCompare(b.fieldId);
    });

    els.inspectorAttributes.innerHTML = '';
    for (const row of attributeRows) {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${row.isKey ? '<span class="instance-table__key-icon">KEY</span>' : ''}${row.fieldId}</td>
        <td>${formatAttributeValue(row.value)}</td>
      `;
      els.inspectorAttributes.appendChild(tr);
    }

    const attachmentCount = EntityAttachments.ensureAttachments(entity).length;
    els.inspectorDocumentsCount.textContent = attachmentCount ? `(${attachmentCount})` : '';
    EntityAttachments.renderDocumentList(els.inspectorDocuments, els.inspectorDocumentsEmpty, entity);

    const related = relatedEntities(entity.id);
    els.inspectorRelatedCount.textContent = related.length ? `(${related.length})` : '';
    els.inspectorRelated.innerHTML = '';
    const relatedWrap = els.inspectorRelated.closest('.instance-table-wrap');
    relatedWrap.classList.toggle('hidden', related.length === 0);
    els.inspectorRelatedEmpty.classList.toggle('hidden', related.length > 0);

    for (const { entity: relatedEntity, label } of related) {
      const tr = document.createElement('tr');
      const tdRelationship = document.createElement('td');
      tdRelationship.textContent = label;

      const tdObject = document.createElement('td');
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'instance-table__object-link';
      button.textContent = DisplayNames.displayName(relatedEntity, lookup);
      button.addEventListener('click', () => selectEntity(relatedEntity.id));

      const meta = document.createElement('span');
      meta.className = 'instance-table__object-meta';
      meta.textContent = `${relatedEntity.type} · ${relatedEntity.id}`;

      tdObject.appendChild(button);
      tdObject.appendChild(meta);
      tr.appendChild(tdRelationship);
      tr.appendChild(tdObject);
      els.inspectorRelated.appendChild(tr);
    }

    syncRelatedOptionsFromSelection();
    updateInspectorPanelContext();
  }

  function collectMapPins() {
    const pins = [];

    for (const entityId of state.pinnedIds) {
      const entity = lookup.get(entityId);
      if (!entity) {
        continue;
      }
      pins.push(...MapLocations.resolvePinsForEntity(entity, lookup, relations, getPinSettings(entityId)));
    }

    return MapLocations.dedupePins(pins);
  }

  function renderAreaHighlight(term) {
    ensureMap();
    areaLayer.clearLayers();

    const area = MapLocations.findGeographicArea(term, lookup);
    if (!area) {
      return false;
    }

    const rectangle = L.rectangle(area.bounds, {
      color: '#1b44b1',
      weight: 2,
      fillColor: '#1b44b1',
      fillOpacity: 0.12,
    }).addTo(areaLayer);

    rectangle.bindPopup(`<strong>${area.label}</strong><br><span style="font-size:11px;color:#6b7785">Geographic area</span>`);
    map.fitBounds(area.bounds, { padding: [24, 24] });
    refreshMapSize();
    return true;
  }

  function shouldPreserveMapView(previousBounds, pinBounds, options) {
    if (options.preserveView === false || options.fitAll === true) {
      return false;
    }
    if (!previousBounds || !pinBounds.isValid()) {
      return false;
    }
    return previousBounds.contains(pinBounds);
  }

  function renderMapPins(options = {}) {
    ensureMap();
    const savedCenter = map.getCenter();
    const savedZoom = map.getZoom();
    const previousBounds = markerLayer.getLayers().length > 0 ? map.getBounds() : null;
    markerLayer.clearLayers();

    const pins = MapLocations.spreadOverlappingPins(collectMapPins());
    for (const pin of pins) {
      const color = typeColors[pin.sourceEntity.type] || '#1b44b1';
      const tooltipHtml = DisplayNames.formatMapPinTooltipHtml(pin);
      const marker = L.marker([pin.geo.lat, pin.geo.lon], {
        icon: L.divIcon({
          className: 'map-marker-wrap',
          html: ObjectIcons.markerHtml(pin.sourceEntity.type, color, {
            indirect: pin.connectionType === 'indirect',
            title: DisplayNames.formatMapPinTooltip(pin),
            selected: isSelectionHighlighted(pin.sourceEntity.id),
          }),
          iconSize: pin.connectionType === 'indirect' ? [28, 28] : [32, 32],
          iconAnchor: pin.connectionType === 'indirect' ? [14, 14] : [16, 16],
        }),
      })
        .bindTooltip(tooltipHtml, {
          direction: 'top',
          offset: [0, -18],
          opacity: 0.96,
          className: 'map-object-tooltip map-object-tooltip--pin',
        })
        .bindPopup(
          ObjectIcons.popupHeaderHtml(
            pin.sourceEntity.type,
            color,
            pin.label,
            pin.sourceEntity.type
          )
        )
        .on('click', (event) => {
          if (event.originalEvent.button !== 0) {
            return;
          }
          if (event.originalEvent.shiftKey) {
            applySelection(pin.sourceEntity.id, { shiftKey: true });
            refreshSelectionViews();
            return;
          }
          selectEntity(pin.sourceEntity.id);
        })
        .on('contextmenu', (event) => {
          L.DomEvent.stopPropagation(event);
          L.DomEvent.preventDefault(event);
          const selectionSnapshot = captureSelectionSnapshot(pin.sourceEntity.id);
          showMapContextMenu(
            pin.sourceEntity.id,
            event.originalEvent.clientX,
            event.originalEvent.clientY,
            selectionSnapshot
          );
        })
        .addTo(markerLayer);
    }

    renderLegend(pins);
    syncHeatmapFromMapPins();
    renderHeatmapLayer();
    const layers = markerLayer.getLayers();
    if (layers.length > 0) {
      const pinBounds = L.featureGroup(layers).getBounds().pad(0.2);
      if (shouldPreserveMapView(previousBounds, pinBounds, options)) {
        map.setView(savedCenter, savedZoom, { animate: false });
      } else {
        map.fitBounds(pinBounds);
      }
      refreshMapSize();
    }
  }

  function renderLegend(pins = collectMapPins()) {
    const pinnedTypes = new Set();
    for (const pin of pins) {
      pinnedTypes.add(pin.colorType);
    }

    if (pinnedTypes.size === 0) {
      els.mapLegend.innerHTML =
        '<span class="map-legend-empty"><span class="map-legend-empty__dot" aria-hidden="true"></span>Pin objects from search to see them here</span>';
      return;
    }

    const chips = [];
    for (const type of pinnedTypes) {
      const color = typeColors[type] || '#1b44b1';
      chips.push(
        `<span class="legend-chip">${ObjectIcons.iconMarkup(type, { size: 12, color, className: 'legend-icon' })}${type}</span>`
      );
    }
    if (pins.some((pin) => pin.connectionType === 'indirect')) {
      chips.push(
        '<span class="legend-chip"><span class="legend-dot legend-dot--indirect"></span>Indirect</span>'
      );
    }
    els.mapLegend.innerHTML = chips.join('');
  }

  function updateGraphZoomLabel() {
    els.graphZoom.textContent = `${Math.round(graphViewport.scale * 100)}%`;
  }

  function applyGraphViewportTransform() {
    const viewport = els.graphSvg.querySelector('.graph-viewport');
    if (viewport) {
      viewport.setAttribute(
        'transform',
        `translate(${graphViewport.x}, ${graphViewport.y}) scale(${graphViewport.scale})`
      );
    }
    updateGraphZoomLabel();
  }

  function clientToGraphPoint(clientX, clientY) {
    const point = els.graphSvg.createSVGPoint();
    point.x = clientX;
    point.y = clientY;
    const matrix = els.graphSvg.getScreenCTM();
    if (!matrix) {
      return { x: 0, y: 0 };
    }
    const svgPoint = point.matrixTransform(matrix.inverse());
    return {
      x: (svgPoint.x - graphViewport.x) / graphViewport.scale,
      y: (svgPoint.y - graphViewport.y) / graphViewport.scale,
    };
  }

  function syncGraphDomPositions() {
    for (const [id, pos] of graphState.positions.entries()) {
      const node = els.graphSvg.querySelector(`[data-entity-id="${id}"]`);
      if (node) {
        node.setAttribute('transform', `translate(${pos.x}, ${pos.y})`);
      }
    }

    for (const line of els.graphSvg.querySelectorAll('.graph-link')) {
      const from = graphState.positions.get(line.dataset.from);
      const to = graphState.positions.get(line.dataset.to);
      if (!from || !to) {
        continue;
      }
      line.setAttribute('x1', from.x);
      line.setAttribute('y1', from.y + 8);
      line.setAttribute('x2', to.x);
      line.setAttribute('y2', to.y + 8);
    }
  }

  function resetGraphViewport() {
    graphViewport.x = 0;
    graphViewport.y = 0;
    graphViewport.scale = 1;
    updateGraphZoomLabel();
  }

  function zoomGraph(delta, clientX, clientY) {
    const frame = els.graphSvg.closest('.graph-frame');
    const bounds = frame.getBoundingClientRect();
    const sx = clientX ?? bounds.left + bounds.width / 2;
    const sy = clientY ?? bounds.top + bounds.height / 2;
    const point = els.graphSvg.createSVGPoint();
    point.x = sx;
    point.y = sy;
    const matrix = els.graphSvg.getScreenCTM();
    if (!matrix) {
      return;
    }
    const svgPoint = point.matrixTransform(matrix.inverse());
    const graphX = (svgPoint.x - graphViewport.x) / graphViewport.scale;
    const graphY = (svgPoint.y - graphViewport.y) / graphViewport.scale;
    graphViewport.scale = Math.max(0.45, Math.min(2.5, graphViewport.scale + delta));
    graphViewport.x = svgPoint.x - graphX * graphViewport.scale;
    graphViewport.y = svgPoint.y - graphY * graphViewport.scale;
    applyGraphViewportTransform();
  }

  function endGraphInteraction() {
    graphInteraction.mode = null;
    graphInteraction.nodeId = null;
    graphInteraction.shiftKey = false;
    graphInteraction.panStart = null;
    graphInteraction.viewportStart = null;
    graphInteraction.nodeOffset = null;
    els.graphSvg.classList.remove('graph-svg--panning', 'graph-svg--dragging-node');
  }

  function hideGraphNodeTooltip() {
    els.graphNodeTooltip.classList.add('hidden');
    els.graphNodeTooltip.setAttribute('aria-hidden', 'true');
  }

  function showGraphNodeTooltip(entity, clientX, clientY) {
    const frame = els.graphSvg.closest('.graph-frame');
    if (!frame || !entity) {
      return;
    }

    const rect = frame.getBoundingClientRect();
    els.graphNodeTooltip.innerHTML = DisplayNames.formatObjectTooltipHtml(
      DisplayNames.displayName(entity, lookup),
      entity.type
    );
    els.graphNodeTooltip.style.left = `${clientX - rect.left}px`;
    els.graphNodeTooltip.style.top = `${clientY - rect.top}px`;
    els.graphNodeTooltip.classList.remove('hidden');
    els.graphNodeTooltip.setAttribute('aria-hidden', 'false');
  }

  function moveGraphNodeTooltip(clientX, clientY) {
    if (els.graphNodeTooltip.classList.contains('hidden')) {
      return;
    }

    const frame = els.graphSvg.closest('.graph-frame');
    if (!frame) {
      return;
    }

    const rect = frame.getBoundingClientRect();
    els.graphNodeTooltip.style.left = `${clientX - rect.left}px`;
    els.graphNodeTooltip.style.top = `${clientY - rect.top}px`;
  }

  function hideGraphContextMenu() {
    els.graphContextMenu.classList.add('hidden');
    graphContextEntityId = null;
    graphContextSelectionIds = [];
    hideGraphNodeTooltip();
  }

  function hideMapContextMenu() {
    els.mapContextMenu.classList.add('hidden');
    mapContextEntityId = null;
    mapContextSelectionIds = [];
  }

  function takeGraphContextEntityId() {
    const entityId = graphContextEntityId;
    hideGraphContextMenu();
    return entityId;
  }

  function takeMapContextEntityId() {
    const entityId = mapContextEntityId;
    hideMapContextMenu();
    return entityId;
  }

  function takeGraphContextSelectionIds() {
    const ids = [...graphContextSelectionIds];
    hideGraphContextMenu();
    return ids;
  }

  function takeMapContextSelectionIds() {
    const ids = [...mapContextSelectionIds];
    hideMapContextMenu();
    return ids;
  }

  function formatBulkActionLabel(singular, count) {
    return count > 1 ? `${singular} (${count})` : singular;
  }

  function setContextMenuLabel(button, singular, count) {
    const label = button?.querySelector('.context-menu__label');
    if (label) {
      label.textContent = formatBulkActionLabel(singular, count);
    }
  }

  function showGraphContextMenu(entityId, clientX, clientY, selectionSnapshot = null) {
    hideMapContextMenu();
    prepareContextSelection(entityId);
    graphContextEntityId = entityId;
    graphContextSelectionIds =
      selectionSnapshot && selectionSnapshot.length > 1
        ? resolveBulkEntityIds(selectionSnapshot)
        : getContextSelectionIds();
    const count = graphContextSelectionIds.length;

    setContextMenuLabel(els.graphContextMap, 'Add to map', count);
    setContextMenuLabel(els.graphContextDetails, 'Open object details', count);
    setContextMenuLabel(els.graphContextRemove, 'Remove object', count);
    els.graphContextExpand.classList.toggle('hidden', count > 1);

    els.graphContextMenu.style.position = 'fixed';
    els.graphContextMenu.style.left = `${clientX}px`;
    els.graphContextMenu.style.top = `${clientY}px`;
    els.graphContextMenu.classList.remove('hidden');
  }

  function showMapContextMenu(entityId, clientX, clientY, selectionSnapshot = null) {
    hideGraphContextMenu();
    prepareContextSelection(entityId);
    mapContextEntityId = entityId;
    mapContextSelectionIds =
      selectionSnapshot && selectionSnapshot.length > 1
        ? resolveBulkEntityIds(selectionSnapshot)
        : getContextSelectionIds();
    const count = mapContextSelectionIds.length;
    const settings = getPinSettings(entityId);

    setContextMenuLabel(els.mapContextGraph, 'Add to graph', count);
    setContextMenuLabel(els.mapContextDetails, 'Open object details', count);
    setContextMenuLabel(els.mapContextRemove, 'Remove object', count);
    setContextMenuLabel(
      els.mapContextRelated,
      settings.showRelated ? 'Hide related objects' : 'Show related objects',
      1
    );
    els.mapContextRelated.classList.toggle('hidden', count > 1);

    els.mapContextMenu.style.position = 'fixed';
    els.mapContextMenu.style.left = `${clientX}px`;
    els.mapContextMenu.style.top = `${clientY}px`;
    els.mapContextMenu.classList.remove('hidden');
  }

  function toggleRelatedObjectsForEntity(entityId) {
    if (!entityId || !lookup.has(entityId)) {
      return;
    }

    state.selectedId = entityId;
    syncRelatedOptionsFromSelection();
    els.showRelatedObjects.checked = !els.showRelatedObjects.checked;
    applyRelatedOptionsForSelection();
  }

  function renderGraphView() {
    const hasNodes = graphState.nodeIds.size > 0;
    els.graphCaption.style.display = hasNodes ? 'none' : '';
    if (!hasNodes) {
      GraphView.clearGraphSvg(els.graphSvg);
      els.graphCaption.innerHTML = EmptyStates.render('graph-empty');
      return;
    }

    GraphView.renderGraphState(
      els.graphSvg,
      graphState,
      lookup,
      state.selectedId,
      graphViewport,
      state.multiSelectedIds
    );
    updateGraphZoomLabel();
  }

  function addToGraph(entityId, options = {}) {
    return appendEntityToGraph(entityId, options);
  }

  function removeEntityFromGraph(entityId, options = {}) {
    if (!graphState.nodeIds.has(entityId)) {
      return false;
    }

    GraphView.removeNode(graphState, entityId);
    state.graphRoots.delete(entityId);
    if (!options.skipRender) {
      renderGraphView();
      refreshSearchResults();
    }
    return true;
  }

  function expandGraphFromNode(entityId, options = {}) {
    if (!lookup.has(entityId)) {
      return { addedNodes: 0, addedLinks: 0 };
    }

    if (!graphState.nodeIds.has(entityId)) {
      GraphView.addNode(graphState, entityId, lookup);
      state.graphRoots.add(entityId);
    }

    const result = GraphView.expandRelationships(graphState, entityId, lookup, relations);
    state.selectedId = entityId;
    renderGraphView();
    refreshSearchResults();

    if (options.openDetails) {
      renderInspector(lookup.get(entityId));
    }

    return result;
  }

  function clearGraphView() {
    hideGraphNodeTooltip();
    graphState.nodeIds.clear();
    graphState.links.length = 0;
    graphState.linkKeys.clear();
    graphState.positions.clear();
    graphState.seedId = null;
    state.graphRoots.clear();
    resetGraphViewport();
    hideGraphContextMenu();
    GraphView.clearGraphSvg(els.graphSvg);
    els.graphCaption.style.display = '';
    els.graphCaption.innerHTML = EmptyStates.render('graph-empty');
    refreshSearchResults();
  }

  function getVizSearchContext() {
    if (state.vizSearchContext) {
      return state.vizSearchContext;
    }
    if (state.activeView === 'map' || state.activeView === 'graph') {
      return state.activeView;
    }
    const shell = document.getElementById('viz-add-shell');
    const shellContext = shell?.dataset?.context;
    return shellContext === 'map' || shellContext === 'graph' ? shellContext : null;
  }

  function shouldShowVizResultsPanel() {
    if (state.activeView !== 'map' && state.activeView !== 'graph') {
      return false;
    }
    if (VizSearchVariant.isModal()) {
      return state.vizSearchModalOpen;
    }
    if (VizSearchVariant.get() === 'strip') {
      return VizSearchVariant.isResultsExpanded();
    }
    if (VizSearchVariant.get() === 'dock') {
      return !VizSearchVariant.isDockCollapsed();
    }
    if (VizSearchVariant.needsExplicitOpen()) {
      return state.vizSearchSessionOpen && VizSearchVariant.isResultsExpanded();
    }
    return true;
  }

  function refreshSearchResults() {
    const items = runSearch(state.searchTerm);
    const vizContext = getVizSearchContext();
    renderSearchResults(items, els.searchResults, 'search');
    if (shouldShowVizResultsPanel() && vizContext) {
      renderSearchResults(items, els.vizSearchResults, vizContext);
    } else if (els.vizSearchResults) {
      els.vizSearchResults.innerHTML = '';
    }

    if (!hasSearchCriteria()) {
      els.searchResults.innerHTML = EmptyStates.render('search-idle');
      if (shouldShowVizResultsPanel()) {
        els.vizSearchResults.innerHTML = EmptyStates.render('search-viz', {
          context: vizContext,
        });
      }
    }
  }

  function selectEntity(entityId) {
    applySelection(entityId);
    const entity = lookup.get(entityId);
    if (entity) {
      renderInspector(entity);
    }
    refreshSearchResults();
    if (graphState.nodeIds.size > 0) {
      renderGraphView();
    }
    if (state.pinnedIds.size > 0) {
      renderMapPins({ preserveView: true });
    }
  }

  function initRelatedTypeFilters() {
    renderRelatedTypeFilters(null);
  }

  function switchView(viewName) {
    state.activeView = viewName;
    if (viewName !== 'map' && viewName !== 'graph') {
      finishVizSearchSession({ clearSearch: false });
      state.vizSearchContext = null;
    }
    if (viewName !== 'map') {
      hideMapContextMenu();
    }
    if (viewName !== 'graph') {
      hideGraphContextMenu();
      hideGraphNodeTooltip();
    }
    document.querySelectorAll('.explorer-tab').forEach((tab) => {
      tab.classList.toggle('active', tab.dataset.view === viewName);
    });
    document.querySelectorAll('.view').forEach((view) => {
      view.classList.toggle('active', view.id === `view-${viewName}`);
    });
    if (viewName === 'map') {
      ensureMap();
      refreshMapSize();
      syncHeatmapFromMapPins();
      renderHeatmapLayer();
      if (state.pinnedIds.size > 0) {
        renderMapPins();
      }
      activateVizSearchForView('map');
    }
    if (viewName === 'graph') {
      renderGraphView();
      activateVizSearchForView('graph');
    }
    if (els.instancePanel.classList.contains('open')) {
      updateInspectorPanelContext();
    }
    SmartSearchBar.syncAll();
    refreshSearchResults();
  }

  els.btnOpenMapSearch?.addEventListener('click', (event) => {
    event.stopPropagation();
    openVizSearch('map');
  });
  els.btnOpenGraphSearch?.addEventListener('click', (event) => {
    event.stopPropagation();
    openVizSearch('graph');
  });
  els.btnCloseVizSearch?.addEventListener('click', () => finishVizSearchSession({ clearSearch: true }));
  els.vizSearchBackdrop?.addEventListener('click', () => finishVizSearchSession({ clearSearch: true }));

  document.addEventListener('keydown', (event) => {
    if ((event.metaKey || event.ctrlKey) && event.key === '/') {
      if (state.activeView === 'map') {
        event.preventDefault();
        openVizSearch('map');
      } else if (state.activeView === 'graph') {
        event.preventDefault();
        openVizSearch('graph');
      }
    }
    if (event.key === 'Escape') {
      if (VizSearchVariant.collapseActivePanel()) {
        event.preventDefault();
        refreshSearchResults();
        return;
      }
      if (VizSearchVariant.isModal() && state.vizSearchModalOpen) {
        event.preventDefault();
        finishVizSearchSession({ clearSearch: true });
        return;
      }
      if (!VizSearchVariant.isModal() && state.vizSearchSessionOpen && VizSearchVariant.needsExplicitOpen()) {
        event.preventDefault();
        finishVizSearchSession({ clearSearch: false });
      }
    }
  });

  els.btnPinMap.addEventListener('click', () => {
    if (!state.selectedId) {
      return;
    }
    state.pinSettings.set(state.selectedId, {
      showRelated: els.showRelatedObjects.checked,
      typeFilters: readRelatedTypeFiltersFromUI(),
      timePeriod: els.relatedTimePeriod.value,
    });
    closeInstancePanel();
    pinEntityOnMap(state.selectedId, { showRelated: els.showRelatedObjects.checked });
  });

  els.showRelatedObjects.addEventListener('change', applyRelatedOptionsForSelection);
  els.relatedTimePeriod.addEventListener('change', applyRelatedOptionsForSelection);

  els.mapShowHeatmap.addEventListener('change', applyHeatmapSettings);

  els.btnAddGraph.addEventListener('click', () => {
    if (!state.selectedId) {
      return;
    }
    addToGraph(state.selectedId, { switchView: true });
    closeInstancePanel();
  });

  els.btnClearMap.addEventListener('click', () => {
    state.pinnedIds.clear();
    state.pinSettings.clear();
    hideMapContextMenu();
    ensureMap();
    areaLayer?.clearLayers();
    renderMapPins();
    refreshSearchResults();
  });

  els.btnGraphClear.addEventListener('click', clearGraphView);

  els.graphContextDetails.addEventListener('click', (event) => {
    event.stopPropagation();
    const entityId = takeGraphContextEntityId();
    if (entityId) {
      selectEntity(entityId);
    }
  });

  els.graphContextExpand.addEventListener('click', (event) => {
    event.stopPropagation();
    const entityId = takeGraphContextEntityId();
    if (entityId) {
      expandGraphFromNode(entityId, { openDetails: false });
    }
  });

  els.graphContextMap.addEventListener('click', (event) => {
    event.stopPropagation();
    const ids = takeGraphContextSelectionIds();
    if (ids.length > 0) {
      pinEntitiesOnMap(ids);
    }
  });

  els.graphContextRemove.addEventListener('click', (event) => {
    event.stopPropagation();
    const ids = takeGraphContextSelectionIds();
    if (ids.length > 0) {
      removeEntitiesFromGraph(ids);
    }
  });

  els.mapContextDetails.addEventListener('click', (event) => {
    event.stopPropagation();
    const entityId = takeMapContextEntityId();
    if (entityId) {
      selectEntity(entityId);
    }
  });

  els.mapContextRelated.addEventListener('click', (event) => {
    event.stopPropagation();
    const entityId = takeMapContextEntityId();
    if (entityId) {
      toggleRelatedObjectsForEntity(entityId);
    }
  });

  els.mapContextGraph.addEventListener('click', (event) => {
    event.stopPropagation();
    const ids = takeMapContextSelectionIds();
    if (ids.length > 0) {
      addEntitiesToGraph(ids, { switchView: true });
    }
  });

  els.mapContextRemove.addEventListener('click', (event) => {
    event.stopPropagation();
    const ids = takeMapContextSelectionIds();
    if (ids.length > 0) {
      removeEntitiesFromMap(ids);
    }
  });

  for (const menu of [els.mapContextMenu, els.graphContextMenu]) {
    menu.addEventListener('mousedown', (event) => event.stopPropagation());
  }

  els.graphSvg.addEventListener('pointerover', (event) => {
    const node = event.target.closest('.graph-node');
    if (!node) {
      return;
    }
    const entity = lookup.get(node.dataset.entityId);
    if (entity) {
      showGraphNodeTooltip(entity, event.clientX, event.clientY);
    }
  });

  els.graphSvg.addEventListener('pointermove', (event) => {
    moveGraphNodeTooltip(event.clientX, event.clientY);
  });

  els.graphSvg.addEventListener('pointerout', (event) => {
    const node = event.target.closest('.graph-node');
    if (!node) {
      return;
    }
    if (event.relatedTarget && node.contains(event.relatedTarget)) {
      return;
    }
    hideGraphNodeTooltip();
  });

  els.graphSvg.addEventListener('pointerleave', hideGraphNodeTooltip);

  els.graphSvg.addEventListener('contextmenu', (event) => {
    const node = event.target.closest('[data-entity-id]');
    if (node) {
      event.preventDefault();
      const selectionSnapshot = captureSelectionSnapshot(node.dataset.entityId);
      showGraphContextMenu(node.dataset.entityId, event.clientX, event.clientY, selectionSnapshot);
    }
  });

  els.graphSvg.addEventListener('mousedown', (event) => {
    if (event.button !== 0) {
      return;
    }
    hideGraphContextMenu();
    hideGraphNodeTooltip();
    const node = event.target.closest('[data-entity-id]');
    if (node) {
      graphInteraction.mode = 'node';
      graphInteraction.nodeId = node.dataset.entityId;
      graphInteraction.shiftKey = event.shiftKey;
      graphInteraction.dragMoved = false;
      const point = clientToGraphPoint(event.clientX, event.clientY);
      const position = graphState.positions.get(graphInteraction.nodeId);
      if (!position) {
        return;
      }
      graphInteraction.nodeOffset = {
        x: point.x - position.x,
        y: point.y - position.y,
      };
      els.graphSvg.classList.add('graph-svg--dragging-node');
      event.preventDefault();
      return;
    }

    graphInteraction.mode = 'pan';
    graphInteraction.panStart = { x: event.clientX, y: event.clientY };
    graphInteraction.viewportStart = { x: graphViewport.x, y: graphViewport.y };
    els.graphSvg.classList.add('graph-svg--panning');
  });

  window.addEventListener('mousemove', (event) => {
    if (graphInteraction.mode === 'pan' && graphInteraction.panStart) {
      graphViewport.x = graphInteraction.viewportStart.x + (event.clientX - graphInteraction.panStart.x);
      graphViewport.y = graphInteraction.viewportStart.y + (event.clientY - graphInteraction.panStart.y);
      applyGraphViewportTransform();
      return;
    }

    if (graphInteraction.mode === 'node' && graphInteraction.nodeId && graphInteraction.nodeOffset) {
      const point = clientToGraphPoint(event.clientX, event.clientY);
      GraphView.setNodePosition(
        graphState,
        graphInteraction.nodeId,
        point.x - graphInteraction.nodeOffset.x,
        point.y - graphInteraction.nodeOffset.y
      );
      graphInteraction.dragMoved = true;
      syncGraphDomPositions();
    }
  });

  window.addEventListener('mouseup', () => {
    if (graphInteraction.mode === 'node' && graphInteraction.nodeId && !graphInteraction.dragMoved) {
      if (graphInteraction.shiftKey) {
        applySelection(graphInteraction.nodeId, { shiftKey: true });
        refreshSelectionViews();
      } else {
        selectEntity(graphInteraction.nodeId);
      }
    }
    endGraphInteraction();
  });

  els.graphSvg.closest('.graph-frame').addEventListener(
    'wheel',
    (event) => {
      if (state.activeView !== 'graph') {
        return;
      }
      event.preventDefault();
      const delta = event.deltaY > 0 ? -0.08 : 0.08;
      zoomGraph(delta, event.clientX, event.clientY);
    },
    { passive: false }
  );

  els.btnGraphZoomIn.addEventListener('click', () => zoomGraph(0.12));
  els.btnGraphZoomOut.addEventListener('click', () => zoomGraph(-0.12));

  els.graphSvg.addEventListener('click', (event) => {
    hideGraphContextMenu();
    if (!event.target.closest('[data-entity-id]') && state.multiSelectedIds.size > 0) {
      clearMultiSelection();
      refreshSelectionViews();
    }
  });

  els.btnClosePanel.addEventListener('click', closeInstancePanel);
  els.instanceBackdrop.addEventListener('click', closeInstancePanel);

  document.querySelectorAll('.explorer-tab').forEach((tab) => {
    tab.addEventListener('click', () => switchView(tab.dataset.view));
  });

  VizSearchVariant.init({
    focusInput: () => els.vizSearchInput?.focus(),
    onClearSearch: () => {
      state.searchTerm = '';
      state.searchFilters = SearchFilters.createDefault(objectTypes);
      SmartSearchBar.syncAll();
      refreshSearchResults();
    },
    onResultsChange: () => {
      refreshSearchResults();
      if (VizSearchVariant.get() === 'dock') {
        refreshMapSize();
      }
    },
  });

  const smartSearchOptions = {
    getState: () => ({ searchTerm: state.searchTerm, searchFilters: state.searchFilters }),
    setSearchTerm: (term) => {
      state.searchTerm = term;
    },
    setSearchFilters: (filters) => {
      state.searchFilters = filters;
      pruneFiltersForSelectedTypes(state.searchFilters);
    },
    objectTypes,
    attributeCatalog,
    onChange: handleSmartSearchChange,
  };

  SmartSearchBar.init({
    root: document.getElementById('global-smart-search'),
    input: els.search,
    pillsEl: document.getElementById('global-search-pills'),
    menuEl: document.getElementById('global-search-menu'),
    ...smartSearchOptions,
  });

  SmartSearchBar.init({
    root: document.getElementById('viz-smart-search'),
    input: els.vizSearchInput,
    pillsEl: document.getElementById('viz-search-pills'),
    menuEl: document.getElementById('viz-search-menu'),
    ...smartSearchOptions,
  });

  renderObjectTypeNav();
  initRelatedTypeFilters();
  syncHeatmapFromMapPins();
  renderLegend([]);
  refreshSearchResults();
  clearGraphView();
  NewObjectForm.init({
    entities,
    relations,
    lookup,
    objectTypes,
    attributeCatalog,
    onCreated(entity) {
      refreshSearchResults();
      selectEntity(entity.id);
      switchView('search');
    },
  });
  switchView('search');
})();
