(function () {
  const { entities, relations, objectTypes } = window.INVESTIGATION_MOCK;
  const lookup = new Map(entities.map((entity) => [entity.id, entity]));
  const typeColors = Object.fromEntries(objectTypes.map((type) => [type.id, type.color]));
  const technicalNames = Object.fromEntries(objectTypes.map((type) => [type.id, type.technicalName]));

  const attributeCatalog = SearchFilters.buildAttributeCatalog(entities, objectTypes);
  const roleCatalog = SearchFilters.buildRoleCatalog(relations);

  const GRAPH_RELATED_MAX_HOPS = 1;
  const GRAPH_RELATED_EXCLUDED_TYPES = new Set([
    'Case Event',
    'Physical Description',
  ]);

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
    activeAsset: 'object-explorer',
    openWorkbenchAssets: new Set(['object-explorer', 'new-object']),
    collapsedResultGroups: new Set(),
    mapHeatmap: {
      enabled: false,
      typeFilters: null,
    },
    activeGeographicArea: null,
    mapDrawMode: null,
    placeSearchResults: [],
    placeSearchTimer: null,
    placeSearchRequestId: 0,
    areaSuggestionResults: [],
    areaSuggestionTimer: null,
    areaSuggestionRequestId: 0,
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
    dragNodeIds: null,
    dragStartPositions: null,
    boxSelectStart: null,
  };

  let map = null;
  let markerLayer = null;
  let areaLayer = null;
  let selectionLayer = null;
  let heatLayer = null;
  const MAP_BASE_ZOOM = 13;
  const AREA_HIGHLIGHT_FILL_OPACITY = 0.05;
  const mapBoxSelect = {
    active: false,
    startLatLng: null,
    startPoint: null,
    rectangle: null,
  };
  const mapDrawState = {
    mode: null,
    polygonPoints: [],
    linePoints: [],
    lassoPoints: [],
    lassoActive: false,
    preview: null,
  };
  const GEOGRAPHIC_AREAS_GROUP_ID = '__geographic_areas__';

  function ensureMap() {
    if (map) {
      return map;
    }

    map = L.map('map', { zoomControl: false }).setView([48.139, 11.565], MAP_BASE_ZOOM);
    map.attributionControl.setPosition('bottomleft');
    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
      attribution: '&copy; OpenStreetMap contributors &copy; CARTO',
      subdomains: 'abcd',
      maxZoom: 20,
    }).addTo(map);
    markerLayer = L.layerGroup().addTo(map);
    areaLayer = L.layerGroup().addTo(map);
    selectionLayer = L.layerGroup().addTo(map);
    mountMapBoxSelection();
    map.on('mousedown', (event) => {
      if (event.originalEvent.button === 0) {
        hideMapContextMenu();
      }
    });

    map.on('click', (event) => {
      if (event.originalEvent?.button !== 0) {
        return;
      }
      if (mapDrawState.mode) {
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
    map.on('zoomend', updateMapZoomLabel);
    updateMapZoomLabel();
    return map;
  }

  function updateMapZoomLabel() {
    if (!map || !els.mapZoom) {
      return;
    }
    const percent = Math.round(100 * 2 ** (map.getZoom() - MAP_BASE_ZOOM));
    els.mapZoom.textContent = `${percent}%`;
  }

  function zoomMap(delta) {
    ensureMap();
    if (delta > 0) {
      map.zoomIn();
      return;
    }
    map.zoomOut();
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
    workbenchAssetExplorer: document.getElementById('workbench-asset-explorer'),
    workbenchAssetNewObject: document.getElementById('workbench-asset-new-object'),
    workbenchTabExplorer: document.getElementById('workbench-tab-explorer'),
    workbenchTabNewObject: document.getElementById('workbench-tab-new-object'),
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
    graphBoxSelect: document.getElementById('graph-box-select'),
    graphNodeTooltip: document.getElementById('graph-node-tooltip'),
    graphContextMenu: document.getElementById('graph-context-menu'),
    graphContextDetails: document.getElementById('graph-context-details'),
    graphContextMap: document.getElementById('graph-context-map'),
    graphContextRemove: document.getElementById('graph-context-remove'),
    graphContextRelatedSection: document.getElementById('graph-context-related-section'),
    graphContextRelatedLabel: document.getElementById('graph-context-related-label'),
    graphContextRelatedDivider: document.getElementById('graph-context-related-divider'),
    graphMenuShowRelated: document.getElementById('graph-menu-show-related'),
    graphMenuRelatedRow: document.getElementById('graph-menu-related-row'),
    graphMenuRelatedTypeFilters: document.getElementById('graph-menu-related-type-filters'),
    graphMenuRelatedFiltersFlyout: document.getElementById('graph-menu-related-filters-flyout'),
    graphMenuRelatedTimePeriod: document.getElementById('graph-menu-related-time-period'),
    btnGraphClear: document.getElementById('btn-graph-clear'),
    btnGraphZoomIn: document.getElementById('btn-graph-zoom-in'),
    btnGraphZoomOut: document.getElementById('btn-graph-zoom-out'),
    graphZoom: document.getElementById('graph-zoom'),
    btnMapZoomIn: document.getElementById('btn-map-zoom-in'),
    btnMapZoomOut: document.getElementById('btn-map-zoom-out'),
    mapZoom: document.getElementById('map-zoom'),
    mapLegend: document.getElementById('map-legend'),
    mapStatusBar: document.querySelector('.map-status-bar'),
    mapFrame: document.getElementById('map-frame'),
    mapAreaTools: document.getElementById('map-area-tools'),
    btnDrawArea: document.getElementById('btn-draw-area'),
    mapAreaToolsMenu: document.getElementById('map-area-tools-menu'),
    mapAreaToolsLabel: document.getElementById('map-area-tools-label'),
    btnFinishAreaShape: document.getElementById('btn-finish-area-shape'),
    btnCancelAreaDraw: document.getElementById('btn-cancel-area-draw'),
    btnShareArea: document.getElementById('btn-share-area'),
    mapSelectionHint: document.getElementById('map-selection-hint'),
    mapShowHeatmap: document.getElementById('map-show-heatmap'),
    mapHeatmapFilters: document.getElementById('map-heatmap-filters'),
    mapHeatmapTypeFilters: document.getElementById('map-heatmap-type-filters'),
    mapContextMenu: document.getElementById('map-context-menu'),
    mapContextDetails: document.getElementById('map-context-details'),
    mapContextRelatedSection: document.getElementById('map-context-related-section'),
    mapContextRelatedLabel: document.getElementById('map-context-related-label'),
    mapContextRelatedDivider: document.getElementById('map-context-related-divider'),
    menuShowRelated: document.getElementById('menu-show-related'),
    menuRelatedRow: document.getElementById('menu-related-row'),
    menuRelatedTypeFilters: document.getElementById('menu-related-type-filters'),
    menuRelatedFiltersFlyout: document.getElementById('menu-related-filters-flyout'),
    menuRelatedTimePeriod: document.getElementById('menu-related-time-period'),
    menuRelatedDistance: document.getElementById('menu-related-distance'),
    mapContextGraph: document.getElementById('map-context-graph'),
    mapContextRemove: document.getElementById('map-context-remove'),
    relatedDistance: document.getElementById('related-distance'),
  };

  function getRelatedUiElements(source = 'panel') {
    if (source === 'menu') {
      return {
        showRelated: els.menuShowRelated,
        relatedRow: els.menuRelatedRow,
        typeFilters: els.menuRelatedTypeFilters,
        timePeriod: els.menuRelatedTimePeriod,
        distance: els.menuRelatedDistance,
      };
    }

    if (source === 'graph-menu') {
      return {
        showRelated: els.graphMenuShowRelated,
        relatedRow: els.graphMenuRelatedRow,
        typeFilters: els.graphMenuRelatedTypeFilters,
        timePeriod: els.graphMenuRelatedTimePeriod,
      };
    }

    return {
      showRelated: els.showRelatedObjects,
      filters: els.relatedObjectFilters,
      typeFilters: els.relatedTypeFilters,
      timePeriod: els.relatedTimePeriod,
      distance: els.relatedDistance,
    };
  }

  function getContextMenuRelatedConfig(context) {
    if (context === 'graph') {
      return {
        context,
        menu: els.graphContextMenu,
        row: els.graphMenuRelatedRow,
        flyout: els.graphMenuRelatedFiltersFlyout,
        typeFilters: els.graphMenuRelatedTypeFilters,
        idPrefix: 'graph-menu-related-type',
        onChange: applyGraphContextMenuRelatedOptions,
      };
    }

    return {
      context: 'map',
      menu: els.mapContextMenu,
      row: els.menuRelatedRow,
      flyout: els.menuRelatedFiltersFlyout,
      typeFilters: els.menuRelatedTypeFilters,
      idPrefix: 'menu-related-type',
      onChange: applyContextMenuRelatedOptions,
    };
  }

  function defaultPinSettings() {
    return {
      showRelated: false,
      typeFilters: null,
      timePeriod: 'all',
      distanceMiles: null,
    };
  }

  function parseDistanceMiles(value) {
    if (value === null || value === undefined || value === '') {
      return null;
    }
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  }

  function formatDistanceMiles(value) {
    return value ? String(value) : '';
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
      if (settings.typeFilters.size >= optionCount) {
        return null;
      }
      return new Set(settings.typeFilters);
    }
    if (settings.typeFilter && settings.typeFilter !== 'all') {
      return new Set([settings.typeFilter]);
    }
    return null;
  }

  function buildGraphRelatedFilters(settings) {
    return {
      typeFilters: normalizePinTypeFilters(settings),
      timePeriod: settings.timePeriod,
      distanceMiles: null,
      excludeTypes: GRAPH_RELATED_EXCLUDED_TYPES,
    };
  }

  function readRelatedTypeFiltersFromContainer(container) {
    const options = getMapRelatedTypeOptions();
    const selected = new Set();
    for (const input of container.querySelectorAll('input[type="checkbox"][data-type-id]')) {
      if (input.checked) {
        selected.add(input.value);
      }
    }
    if (selected.size === options.length) {
      return null;
    }
    return selected;
  }

  function formatRelatedTypeFilterLabel(activeFilters) {
    const options = getMapRelatedTypeOptions();
    const active = activeFilters instanceof Set ? activeFilters : null;
    if (!active) {
      return 'All object types';
    }
    if (active.size === 0) {
      return 'No object types';
    }
    if (active.size === 1) {
      return [...active][0];
    }
    return `${active.size} object types`;
  }

  const relatedTypeMultiselectState = new WeakMap();

  function getRelatedTypeMultiselectUi(container) {
    return relatedTypeMultiselectState.get(container) || null;
  }

  function syncRelatedTypeMultiselectLabel(container, activeFilters = null) {
    const ui = getRelatedTypeMultiselectUi(container);
    if (!ui?.label) {
      return;
    }
    const filters =
      activeFilters === null ? readRelatedTypeFiltersFromContainer(container) : activeFilters;
    ui.label.textContent = formatRelatedTypeFilterLabel(filters);
  }

  function closeRelatedTypeMultiselect(container) {
    const ui = getRelatedTypeMultiselectUi(container);
    if (!ui) {
      return;
    }
    ui.panel?.classList.add('hidden');
    ui.trigger?.setAttribute('aria-expanded', 'false');
  }

  function renderRelatedTypeMultiselect(container, activeFilters, config = {}) {
    const options = getMapRelatedTypeOptions();
    const active = activeFilters instanceof Set ? activeFilters : null;
    const allActive = !active;
    const { idPrefix, onChange, onOpen, stopPropagation = false } = config;

    if (!container.dataset.mounted) {
      container.dataset.mounted = 'true';
      container.innerHTML = `
        <button type="button" class="type-multiselect-trigger" id="${idPrefix}-trigger" aria-haspopup="listbox" aria-expanded="false">
          <span class="type-multiselect-label" id="${idPrefix}-label"></span>
          <span class="type-multiselect-chevron" aria-hidden="true">▾</span>
        </button>
        <div class="type-multiselect-panel hidden" id="${idPrefix}-panel" role="listbox">
          <div class="type-multiselect-actions">
            <button type="button" class="type-multiselect-action" id="${idPrefix}-select-all">Select all</button>
            <button type="button" class="type-multiselect-action" id="${idPrefix}-clear-all">Clear all</button>
          </div>
          <div class="type-multiselect-options" id="${idPrefix}-options"></div>
        </div>
      `;

      const ui = {
        trigger: document.getElementById(`${idPrefix}-trigger`),
        label: document.getElementById(`${idPrefix}-label`),
        panel: document.getElementById(`${idPrefix}-panel`),
        options: document.getElementById(`${idPrefix}-options`),
        selectAll: document.getElementById(`${idPrefix}-select-all`),
        clearAll: document.getElementById(`${idPrefix}-clear-all`),
      };
      relatedTypeMultiselectState.set(container, ui);

      ui.trigger.addEventListener('click', (event) => {
        event.stopPropagation();
        const open = ui.panel.classList.contains('hidden');
        closeMenuRelatedFlyouts();
        closeRelatedTypeMultiselect(els.relatedTypeFilters);
        ui.panel.classList.toggle('hidden', !open);
        ui.trigger.setAttribute('aria-expanded', String(open));
        if (open) {
          onOpen?.();
        }
      });

      ui.selectAll.addEventListener('click', (event) => {
        event.stopPropagation();
        for (const input of ui.options.querySelectorAll('input[type="checkbox"]')) {
          input.checked = true;
        }
        syncRelatedTypeMultiselectLabel(container);
        onChange?.();
      });

      ui.clearAll.addEventListener('click', (event) => {
        event.stopPropagation();
        for (const input of ui.options.querySelectorAll('input[type="checkbox"]')) {
          input.checked = false;
        }
        syncRelatedTypeMultiselectLabel(container);
        onChange?.();
      });

      if (stopPropagation) {
        container.addEventListener('mousedown', (event) => event.stopPropagation());
        container.addEventListener('click', (event) => event.stopPropagation());
      }
    }

    const ui = getRelatedTypeMultiselectUi(container);
    ui.options.innerHTML = '';
    for (const type of options) {
      const checked = allActive || active.has(type.id);
      const row = document.createElement('label');
      row.className = 'type-multiselect-option';
      row.innerHTML = `
        <input type="checkbox" data-type-id="${type.id}" value="${type.id}" ${checked ? 'checked' : ''} />
        <span>${type.id}</span>
      `;
      row.querySelector('input').addEventListener('change', () => {
        syncRelatedTypeMultiselectLabel(container);
        onChange?.();
      });
      ui.options.appendChild(row);
    }

    syncRelatedTypeMultiselectLabel(container, activeFilters);
    closeRelatedTypeMultiselect(container);
  }

  function renderMenuRelatedTypeFilters(activeFilters, context = 'map') {
    const config = getContextMenuRelatedConfig(context);
    renderRelatedTypeMultiselect(config.typeFilters, activeFilters, {
      idPrefix: config.idPrefix,
      onChange: config.onChange,
      onOpen: () => requestAnimationFrame(() => positionMenuRelatedFlyout(context)),
      stopPropagation: true,
    });
  }

  function syncContextMenuRelatedFiltersFlyout(settings, context = 'map') {
    const config = getContextMenuRelatedConfig(context);
    renderMenuRelatedTypeFilters(normalizePinTypeFilters(settings), context);
    const ui = getRelatedUiElements(context === 'graph' ? 'graph-menu' : 'menu');
    ui.timePeriod.value = settings.timePeriod || 'all';
    if (ui.distance) {
      ui.distance.value = formatDistanceMiles(settings.distanceMiles);
    }

    if (openMenuRelatedFlyoutContext === context) {
      requestAnimationFrame(() => positionMenuRelatedFlyout(context));
    }
  }

  let openMenuRelatedFlyoutContext = null;

  function positionMenuRelatedFlyout(context = openMenuRelatedFlyoutContext || 'map') {
    const config = getContextMenuRelatedConfig(context);
    const flyout = config.flyout;
    const anchor = config.row;
    const menu = config.menu;
    if (!flyout || !anchor || !menu) {
      return;
    }

    flyout.style.position = 'fixed';
    flyout.style.right = 'auto';
    flyout.style.bottom = 'auto';
    flyout.style.zIndex = '10001';

    const padding = 8;
    const gap = 4;
    const menuRect = menu.getBoundingClientRect();
    const anchorRect = anchor.getBoundingClientRect();
    flyout.classList.remove('hidden');

    const flyoutRect = flyout.getBoundingClientRect();
    let left = menuRect.right + gap;
    let top = anchorRect.top - 6;

    if (left + flyoutRect.width > window.innerWidth - padding) {
      left = menuRect.left - flyoutRect.width - gap;
    }
    left = Math.max(padding, Math.min(left, window.innerWidth - flyoutRect.width - padding));

    if (top + flyoutRect.height > window.innerHeight - padding) {
      top = Math.max(padding, window.innerHeight - flyoutRect.height - padding);
    }
    top = Math.max(padding, top);

    flyout.style.left = `${left}px`;
    flyout.style.top = `${top}px`;
  }

  function closeMenuRelatedFlyouts() {
    closeRelatedTypeMultiselect(els.menuRelatedTypeFilters);
    closeRelatedTypeMultiselect(els.graphMenuRelatedTypeFilters);
    els.menuRelatedFiltersFlyout?.classList.add('hidden');
    els.graphMenuRelatedFiltersFlyout?.classList.add('hidden');
    els.menuRelatedRow?.classList.remove('is-open');
    els.graphMenuRelatedRow?.classList.remove('is-open');
    openMenuRelatedFlyoutContext = null;
  }

  function openMenuRelatedFlyoutPanel(context = 'map') {
    const config = getContextMenuRelatedConfig(context);
    const ui = getRelatedUiElements(context === 'graph' ? 'graph-menu' : 'menu');
    if (!config.flyout || !ui.showRelated.checked) {
      return;
    }

    openMenuRelatedFlyoutContext = context;
    config.row?.classList.add('is-open');
    positionMenuRelatedFlyout(context);
    requestAnimationFrame(() => positionMenuRelatedFlyout(context));
  }

  function updateContextMenuRelatedFilterVisibility(context = 'map') {
    const config = getContextMenuRelatedConfig(context);
    const ui = getRelatedUiElements(context === 'graph' ? 'graph-menu' : 'menu');
    const enabled = ui.showRelated.checked;
    config.row?.classList.toggle('is-enabled', enabled);
    config.row?.classList.toggle('is-checked', enabled);

    if (enabled) {
      openMenuRelatedFlyoutPanel(context);
      return;
    }

    if (openMenuRelatedFlyoutContext === context) {
      closeMenuRelatedFlyouts();
    }
  }

  function renderRelatedTypeFilters(activeFilters) {
    renderRelatedTypeMultiselect(els.relatedTypeFilters, activeFilters, {
      idPrefix: 'panel-related-type',
      onChange: applyRelatedOptionsForSelection,
    });
  }

  function readRelatedTypeFiltersFromUI() {
    return readRelatedTypeFiltersFromContainer(els.relatedTypeFilters);
  }

  function readRelatedSettingsFromUI(source = 'panel') {
    const ui = getRelatedUiElements(source);
    return {
      showRelated: ui.showRelated.checked,
      typeFilters: readRelatedTypeFiltersFromContainer(ui.typeFilters),
      timePeriod: ui.timePeriod.value,
      distanceMiles: ui.distance ? parseDistanceMiles(ui.distance.value) : null,
    };
  }

  function writeRelatedSettingsToUI(settings, target = 'panel') {
    const ui = getRelatedUiElements(target);

    ui.showRelated.checked = settings.showRelated;
    ui.timePeriod.value = settings.timePeriod || 'all';
    if (ui.distance) {
      ui.distance.value = formatDistanceMiles(settings.distanceMiles);
    }

    if (target === 'menu' || target === 'graph-menu') {
      syncContextMenuRelatedFiltersFlyout(settings, target === 'graph-menu' ? 'graph' : 'map');
      updateContextMenuRelatedFilterVisibility(target === 'graph-menu' ? 'graph' : 'map');
      return;
    }

    renderRelatedTypeFilters(normalizePinTypeFilters(settings));
    updateRelatedFilterVisibility();
  }

  function updateMenuRelatedFilterVisibility() {
    updateContextMenuRelatedFilterVisibility('map');
  }

  function updateGraphMenuRelatedFilterVisibility() {
    updateContextMenuRelatedFilterVisibility('graph');
  }

  function getPinSettings(entityId) {
    return state.pinSettings.get(entityId) || defaultPinSettings();
  }

  function updateRelatedFilterVisibility() {
    els.relatedObjectFilters.classList.toggle('hidden', !els.showRelatedObjects.checked);
  }

  function syncRelatedOptionsFromSelection() {
    if (!state.selectedId) {
      writeRelatedSettingsToUI(defaultPinSettings(), 'panel');
      return;
    }

    writeRelatedSettingsToUI(getPinSettings(state.selectedId), 'panel');
  }

  function applyRelatedSettingsForEntity(entityId, settings, options = {}) {
    if (!entityId || !lookup.has(entityId)) {
      return;
    }

    state.selectedId = entityId;
    state.pinSettings.set(entityId, {
      showRelated: settings.showRelated,
      typeFilters: settings.typeFilters,
      timePeriod: settings.timePeriod,
      distanceMiles: settings.distanceMiles,
    });

    if (!options.skipPanelSync) {
      writeRelatedSettingsToUI(settings, 'panel');
    }

    if (state.activeView === 'map') {
      if (!state.pinnedIds.has(entityId)) {
        if (settings.showRelated) {
          pinEntityOnMap(entityId, { stayOnMap: true, showRelated: true, ...settings });
        }
        return;
      }

      if (!options.skipRender) {
        renderMapPins();
      }
      return;
    }

    if (state.activeView === 'graph') {
      if (!graphState.nodeIds.has(entityId)) {
        if (settings.showRelated) {
          appendEntityToGraph(entityId, { stayOnGraph: true });
        } else {
          return;
        }
      }

      if (!state.graphRoots.has(entityId)) {
        state.graphRoots.add(entityId);
      }

      if (!options.skipRender) {
        syncGraphRelatedObjects();
      }
    }
  }

  function getBulkRelatedSettings(entityIds) {
    if (entityIds.length === 0) {
      return defaultPinSettings();
    }

    const settingsList = entityIds.map((entityId) => getPinSettings(entityId));
    const anyShowRelated = settingsList.some((settings) => settings.showRelated);
    const first = settingsList[0];

    return {
      showRelated: anyShowRelated,
      typeFilters: first.typeFilters,
      timePeriod: first.timePeriod,
      distanceMiles: first.distanceMiles,
    };
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

      const related = MapLocations.collectGraphRelatedEntries(
        rootEntity,
        lookup,
        relations,
        GRAPH_RELATED_MAX_HOPS,
        buildGraphRelatedFilters(settings),
      );

      for (const entry of related) {
        nodeIds.add(entry.entityId);
      }
    }

    return nodeIds;
  }

  function buildGraphAdjacency() {
    const adjacency = new Map();
    for (const link of graphState.links) {
      if (!adjacency.has(link.from)) {
        adjacency.set(link.from, new Set());
      }
      if (!adjacency.has(link.to)) {
        adjacency.set(link.to, new Set());
      }
      adjacency.get(link.from).add(link.to);
      adjacency.get(link.to).add(link.from);
    }
    return adjacency;
  }

  function getReachableGraphNodeIds(fromRootIds) {
    const adjacency = buildGraphAdjacency();
    const reachable = new Set();
    const queue = [...fromRootIds].filter((id) => graphState.nodeIds.has(id));
    for (const id of queue) {
      reachable.add(id);
    }

    for (let index = 0; index < queue.length; index += 1) {
      const id = queue[index];
      for (const neighbor of adjacency.get(id) || []) {
        if (!reachable.has(neighbor) && graphState.nodeIds.has(neighbor)) {
          reachable.add(neighbor);
          queue.push(neighbor);
        }
      }
    }

    return reachable;
  }

  function anyGraphRootShowsRelated() {
    for (const rootId of state.graphRoots) {
      if (getPinSettings(rootId).showRelated) {
        return true;
      }
    }
    return false;
  }

  function pruneDisconnectedGraphNodes() {
    if (state.graphRoots.size === 0) {
      for (const id of [...graphState.nodeIds]) {
        GraphView.removeNode(graphState, id);
      }
      return;
    }

    const reachable = getReachableGraphNodeIds(state.graphRoots);
    for (const id of [...graphState.nodeIds]) {
      if (!reachable.has(id)) {
        GraphView.removeNode(graphState, id);
      }
    }
  }

  function reconcileGraphAfterRemoval(options = {}) {
    pruneDisconnectedGraphNodes();
    if (anyGraphRootShowsRelated()) {
      syncGraphRelatedObjects();
      return;
    }
    if (!options.skipRender) {
      renderGraphView();
      refreshSearchResults();
    }
  }

  function refreshGraphLinks() {
    graphState.links = [];
    graphState.linkKeys.clear();

    function mergeRolesForLink(from, to) {
      const roles = [];
      for (const rel of relations) {
        const matches =
          (rel.from === from && rel.to === to) || (rel.from === to && rel.to === from);
        if (matches && rel.role) {
          roles.push(rel.role);
        }
      }
      return roles;
    }

    function addMergedLink(from, to, label, fallbackRole = null) {
      const roles = mergeRolesForLink(from, to);
      if (roles.length === 0) {
        GraphView.addLink(graphState, from, to, label, fallbackRole);
        return;
      }
      for (const role of roles) {
        GraphView.addLink(graphState, from, to, label, role);
      }
    }

    const showRelatedActive = anyGraphRootShowsRelated();

    if (!showRelatedActive) {
      const seenPairs = new Set();
      for (const rootId of state.graphRoots) {
        for (const rel of relations) {
          if (rel.from !== rootId && rel.to !== rootId) {
            continue;
          }
          const otherId = rel.from === rootId ? rel.to : rel.from;
          if (!graphState.nodeIds.has(otherId)) {
            continue;
          }
          const pairKey = [rootId, otherId].sort().join(':');
          if (seenPairs.has(pairKey)) {
            continue;
          }
          seenPairs.add(pairKey);
          addMergedLink(rootId, otherId, rel.label, rel.role ?? null);
        }
      }
      return;
    }

    for (const rootId of state.graphRoots) {
      const settings = getPinSettings(rootId);
      if (!settings.showRelated || !graphState.nodeIds.has(rootId)) {
        continue;
      }

      const rootEntity = lookup.get(rootId);
      if (!rootEntity) {
        continue;
      }

      const relatedEntries = MapLocations.collectGraphRelatedEntries(
        rootEntity,
        lookup,
        relations,
        GRAPH_RELATED_MAX_HOPS,
        buildGraphRelatedFilters(settings),
      );

      for (const entry of relatedEntries) {
        if (!graphState.nodeIds.has(entry.entityId) || entry.entityId === entry.anchorId) {
          continue;
        }
        addMergedLink(entry.anchorId, entry.entityId, entry.label, entry.role ?? null);
      }
    }
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

    GraphView.resolveOverlaps(graphState);
    renderGraphView();
  }

  function applyRelatedOptionsForSelection() {
    if (!state.selectedId) {
      return;
    }

    applyRelatedSettingsForEntity(state.selectedId, readRelatedSettingsFromUI('panel'));
  }

  function getLinkedPlacementIds(entityId) {
    const ids = new Set([entityId]);
    const entity = lookup.get(entityId);
    if (!entity?.attributes) {
      return ids;
    }
    const personId = entity.attributes.PERSON_ID;
    const identityId = entity.attributes.IDENTITY_RECORD_ID;
    if (personId) {
      ids.add(personId);
    }
    if (identityId) {
      ids.add(identityId);
    }
    return ids;
  }

  function buildMapPresenceIndex() {
    const visible = new Set();
    for (const pinnedId of state.pinnedIds) {
      for (const id of getLinkedPlacementIds(pinnedId)) {
        visible.add(id);
      }
    }
    for (const pin of collectMapPins()) {
      visible.add(pin.sourceEntity.id);
      for (const id of getLinkedPlacementIds(pin.sourceEntity.id)) {
        visible.add(id);
      }
    }
    return visible;
  }

  function buildGraphPresenceIndex() {
    const visible = new Set();
    for (const nodeId of graphState.nodeIds) {
      for (const id of getLinkedPlacementIds(nodeId)) {
        visible.add(id);
      }
    }
    return visible;
  }

  function getMapPinToggleId(entityId) {
    if (state.pinnedIds.has(entityId)) {
      return entityId;
    }
    for (const linkedId of getLinkedPlacementIds(entityId)) {
      if (state.pinnedIds.has(linkedId)) {
        return linkedId;
      }
    }
    return null;
  }

  function getGraphToggleId(entityId) {
    if (graphState.nodeIds.has(entityId)) {
      return entityId;
    }
    for (const linkedId of getLinkedPlacementIds(entityId)) {
      if (graphState.nodeIds.has(linkedId)) {
        return linkedId;
      }
    }
    return null;
  }

  function isEntityOnMap(entityId, mapPresence = null) {
    if (mapPresence) {
      return mapPresence.has(entityId);
    }
    return buildMapPresenceIndex().has(entityId);
  }

  function isEntityOnGraph(entityId, graphPresence = null) {
    if (graphPresence) {
      return graphPresence.has(entityId);
    }
    return buildGraphPresenceIndex().has(entityId);
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
        distanceMiles:
          options.distanceMiles !== undefined
            ? options.distanceMiles
            : parseDistanceMiles(els.relatedDistance.value),
      });
    }
    state.selectedId = entityId;
    syncRelatedOptionsFromSelection();
    ensureMap();
    if (!options.skipRender) {
      if (!options.stayOnMap && state.activeView !== 'map') {
        switchView('map', { mapRenderOptions: { fitAll: true } });
      } else {
        renderMapPins(options);
      }
      refreshSearchResults();
    } else if (!options.stayOnMap && state.activeView !== 'map') {
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
      if (removeEntityFromGraph(entityId, { skipRender: true, skipPrune: true })) {
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

    reconcileGraphAfterRemoval();
    afterVizRemove('graph');
  }

  function appendEntityToGraph(entityId, options = {}) {
    const entity = lookup.get(entityId);
    if (!entity) {
      return false;
    }

    const wasNew = !graphState.nodeIds.has(entityId);
    if (wasNew) {
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

  function setMultiSelection(entityIds) {
    const ids = resolveBulkEntityIds(entityIds);
    clearMultiSelection();
    for (const entityId of ids) {
      state.multiSelectedIds.add(entityId);
    }
    if (ids.length > 0) {
      state.selectedId = ids[ids.length - 1];
      state.multiSelectAnchorId = ids[0];
    }
  }

  function syncShareAreaUi() {
    const area = state.searchFilters.geographicArea;
    const showShare = Boolean(area && state.activeAsset === 'object-explorer' && state.activeView === 'map');
    els.btnShareArea?.classList.toggle('hidden', !showShare);
  }

  function syncGeographicAreaToUrl() {
    const area = state.searchFilters.geographicArea;
    const url = new URL(window.location.href);
    if (area) {
      const encoded = MapLocations.encodeAreaShareParam(area);
      if (encoded) {
        url.searchParams.set('area', encoded);
      }
    } else {
      url.searchParams.delete('area');
    }
    window.history.replaceState({}, '', url);
  }

  async function shareGeographicAreaLink() {
    const area = state.searchFilters.geographicArea;
    if (!area) {
      return;
    }

    const shareUrl = MapLocations.buildAreaShareUrl(area);
    syncGeographicAreaToUrl();

    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(shareUrl);
      } else {
        window.prompt('Copy this link to share the geographic area:', shareUrl);
        return;
      }
      VizSearchVariant.showToast('Area link copied to clipboard');
    } catch {
      window.prompt('Copy this link to share the geographic area:', shareUrl);
    }
  }

  async function loadGeographicAreaFromUrl() {
    const encoded = new URLSearchParams(window.location.search).get('area');
    if (!encoded) {
      return;
    }

    const area = MapLocations.decodeAreaShareParam(encoded);
    if (!area) {
      return;
    }

    await applyGeographicAreaFilter(area, { openSearch: false, clearSearchTerm: false });
    switchAsset('object-explorer');
    switchView('map');
  }

  function clearMapAreaHighlight() {
    ensureMap();
    areaLayer?.clearLayers();
    state.activeGeographicArea = null;
  }

  function renderAreaShapeOnMap(area) {
    if (!area) {
      return false;
    }

    ensureMap();
    areaLayer.clearLayers();

    if (area.shape === 'polygon' && area.polygon?.length >= 3) {
      const latlngs = area.polygon.map((point) => [point.lat, point.lon]);
      L.polygon(latlngs, {
        color: '#1b44b1',
        weight: 2,
        fillColor: '#1b44b1',
        fillOpacity: AREA_HIGHLIGHT_FILL_OPACITY,
      })
        .bindPopup(
          `<strong>${area.label}</strong><br><span style="font-size:11px;color:#6b7785">Custom area</span>`
        )
        .addTo(areaLayer);
    } else if (area.shape === 'line' && area.line?.length >= 2) {
      const latlngs = area.line.map((point) => [point.lat, point.lon]);
      L.polyline(latlngs, {
        color: '#1b44b1',
        weight: 4,
      })
        .bindPopup(
          `<strong>${area.label}</strong><br><span style="font-size:11px;color:#6b7785">Custom area</span>`
        )
        .addTo(areaLayer);
    } else if (area.shape === 'circle' && area.center && area.radiusMeters > 0) {
      L.circle([area.center.lat, area.center.lon], {
        radius: area.radiusMeters,
        color: '#1b44b1',
        weight: 2,
        fillColor: '#1b44b1',
        fillOpacity: AREA_HIGHLIGHT_FILL_OPACITY,
      })
        .bindPopup(
          `<strong>${area.label}</strong><br><span style="font-size:11px;color:#6b7785">Custom area</span>`
        )
        .addTo(areaLayer);
    } else if (area.bounds) {
      L.rectangle(area.bounds, {
        color: '#1b44b1',
        weight: 2,
        fillColor: '#1b44b1',
        fillOpacity: AREA_HIGHLIGHT_FILL_OPACITY,
      })
        .bindPopup(
          `<strong>${area.label}</strong><br><span style="font-size:11px;color:#6b7785">Geographic area</span>`
        )
        .addTo(areaLayer);
    } else {
      return false;
    }

    map.fitBounds(area.bounds, { padding: [24, 24] });
    refreshMapSize();
    return true;
  }

  function syncGeographicAreaHighlight() {
    const area = state.searchFilters.geographicArea;
    if (!area || state.activeView !== 'map') {
      clearMapAreaHighlight();
      return;
    }

    state.activeGeographicArea = { id: area.id, term: area.label, label: area.label };
    renderAreaShapeOnMap(area);
  }

  async function applyGeographicAreaFilter(area, options = {}) {
    if (!area) {
      return;
    }

    let resolved = area;
    if (!(area.polygon?.length >= 3) && area.source !== 'drawn') {
      resolved = await PlaceSearch.resolveAreaBoundary(area);
    }
    if (!resolved) {
      return;
    }

    const next = SearchFilters.clone(state.searchFilters);
    next.geographicArea = MapLocations.cloneArea(resolved);
    state.searchFilters = next;
    if (options.clearSearchTerm !== false) {
      state.searchTerm = '';
    }
    SmartSearchBar.syncAll();
    syncGeographicAreaHighlight();
    syncGeographicAreaToUrl();
    syncShareAreaUi();
    refreshSearchResults();

    if (options.openSearch && state.activeView === 'map') {
      state.vizSearchSessionOpen = true;
      VizSearchVariant.updateOpenState(true, 'map');
    }
  }

  function handleApplyArea(areaOrTerm, displayHint) {
    const payload =
      typeof areaOrTerm === 'object'
        ? areaOrTerm
        : { label: String(areaOrTerm || '').trim(), displayName: displayHint || null };
    applyGeographicAreaFilter(payload);
  }

  function getPlaceSearchViewbox() {
    return PlaceSearch.GERMANY_VIEWBOX;
  }

  function pickBestAreaMatch(areas, term) {
    if (!areas?.length) {
      return null;
    }

    const normalized = String(term || '').trim().toLowerCase();
    const top = areas[0];
    const exactLabel = areas.find((area) => area.label?.toLowerCase() === normalized);

    if (exactLabel?.polygon?.length >= 3) {
      return exactLabel;
    }
    if (top?.polygon?.length >= 3) {
      return top;
    }
    return exactLabel || top;
  }

  function resolveAreaFromTerm(term) {
    const normalized = String(term || '').trim();
    if (!normalized) {
      return null;
    }

    const local = MapLocations.findGeographicArea(normalized, lookup);
    if (local) {
      return local;
    }

    const localMatches = MapLocations.searchGeographicAreas(normalized, lookup, 20);
    const merged = PlaceSearch.mergeAreas(
      localMatches,
      [...(state.placeSearchResults || []), ...PlaceSearch.getCached(normalized)],
      normalized,
      20
    );
    return pickBestAreaMatch(merged, normalized);
  }

  function schedulePlaceSearchFromInput(inputValue) {
    if (!isMapGeographicSearchEnabled()) {
      state.placeSearchResults = [];
      return;
    }
    const raw = inputValue ?? state.searchTerm;
    if (PlaceSearch.extractAreaSuggestionQuery(raw) !== null) {
      return;
    }

    const query = PlaceSearch.extractSearchQuery(raw);
    window.clearTimeout(state.placeSearchTimer);

    if (query.length < 2) {
      state.placeSearchResults = [];
      return;
    }

    state.placeSearchTimer = window.setTimeout(async () => {
      const requestId = ++state.placeSearchRequestId;
      const results = await PlaceSearch.searchPlaces(query, {
        viewbox: getPlaceSearchViewbox(),
        limit: 20,
      });
      if (requestId !== state.placeSearchRequestId) {
        return;
      }
      state.placeSearchResults = results;
      refreshSearchResults();
      SmartSearchBar.syncAll();
    }, 350);
  }

  function scheduleAreaSuggestionSearch(inputValue) {
    if (!isMapGeographicSearchEnabled()) {
      state.areaSuggestionResults = [];
      return;
    }
    const partial = PlaceSearch.extractAreaSuggestionQuery(inputValue ?? state.searchTerm);
    if (partial === null) {
      return;
    }

    window.clearTimeout(state.areaSuggestionTimer);

    if (!partial) {
      state.areaSuggestionResults = PlaceSearch.getDefaultAreaSuggestions();
      SmartSearchBar.refreshMenus();
      return;
    }

    state.areaSuggestionTimer = window.setTimeout(async () => {
      const requestId = ++state.areaSuggestionRequestId;
      const results = await PlaceSearch.searchAreaSuggestions(partial, {
        viewbox: getPlaceSearchViewbox(),
        limit: 15,
      });
      if (requestId !== state.areaSuggestionRequestId) {
        return;
      }
      state.areaSuggestionResults = results;
      SmartSearchBar.refreshMenus();
    }, partial.length < 2 ? 450 : 250);
  }

  function getMatchingGeographicAreas() {
    if (!isMapGeographicSearchEnabled()) {
      return [];
    }
    const term = state.searchTerm.trim();
    if (!term || term.length < 2 || SmartSearchBar.isFilterCommandInput(term)) {
      return [];
    }
    const local = MapLocations.searchGeographicAreas(term, lookup, 20);
    const cached = PlaceSearch.getCached(term);
    return PlaceSearch.mergeAreas(local, [...(state.placeSearchResults || []), ...cached], term, 20);
  }

  function clearMapDrawPreview() {
    if (mapDrawState.preview) {
      selectionLayer?.removeLayer(mapDrawState.preview);
      mapDrawState.preview = null;
    }
  }

  function updateMapDrawUi() {
    const active = Boolean(mapDrawState.mode);

    els.mapFrame?.classList.toggle('map-frame--draw-area', active);
    els.mapAreaTools?.classList.toggle('hidden', active);
    els.btnDrawArea?.classList.toggle('active', active);
    els.mapAreaToolsMenu
      ?.querySelectorAll('[data-draw-mode]')
      .forEach((button) => button.classList.toggle('active', button.dataset.drawMode === mapDrawState.mode));

    if (els.mapAreaToolsLabel) {
      els.mapAreaToolsLabel.textContent = 'Draw area';
    }

    els.btnFinishAreaShape?.classList.toggle(
      'hidden',
      mapDrawState.mode !== 'polygon' && mapDrawState.mode !== 'line'
    );
    els.btnCancelAreaDraw?.classList.toggle('hidden', !active);

    if (active) {
      closeMapAreaToolsMenu();
    }

    if (els.mapSelectionHint) {
      if (mapDrawState.mode === 'rectangle') {
        els.mapSelectionHint.textContent = 'Drag on the map to draw a rectangular area';
      } else if (mapDrawState.mode === 'circle') {
        els.mapSelectionHint.textContent = 'Drag from the center to set the circle radius';
      } else if (mapDrawState.mode === 'polygon') {
        els.mapSelectionHint.textContent = 'Click points on the map, then press Finish shape';
      } else if (mapDrawState.mode === 'lasso') {
        els.mapSelectionHint.textContent = 'Draw a freehand shape on the map to define the area';
      } else if (mapDrawState.mode === 'line') {
        els.mapSelectionHint.textContent = 'Click to add line segments, then press Finish shape';
      } else {
        els.mapSelectionHint.textContent = 'Shift+drag to select multiple objects';
      }
    }
  }

  function closeMapAreaToolsMenu() {
    els.mapAreaToolsMenu?.classList.add('hidden');
    els.btnDrawArea?.setAttribute('aria-expanded', 'false');
  }

  function toggleMapAreaToolsMenu() {
    const isOpen = !els.mapAreaToolsMenu?.classList.contains('hidden');
    if (isOpen) {
      closeMapAreaToolsMenu();
      return;
    }
    els.mapAreaToolsMenu?.classList.remove('hidden');
    els.btnDrawArea?.setAttribute('aria-expanded', 'true');
  }

  function setMapDrawMode(mode) {
    mapDrawState.mode = mode;
    mapDrawState.polygonPoints = [];
    mapDrawState.linePoints = [];
    mapDrawState.lassoPoints = [];
    mapDrawState.lassoActive = false;
    clearMapDrawPreview();
    clearMapBoxSelectionOverlay();
    ensureMap();
    if (map) {
      if (mode) {
        map.dragging.disable();
      } else if (!mapBoxSelect.active) {
        map.dragging.enable();
      }
    }
    updateMapDrawUi();
  }

  function finishCustomCircleDraw(center, edge) {
    ensureMap();
    const radiusMeters = map.distance(center, edge);
    if (!(radiusMeters >= 10)) {
      clearMapBoxSelectionOverlay();
      setMapDrawMode(null);
      return;
    }

    const area = MapLocations.circleFromLatLngPoints(center, edge, 'Custom area');
    clearMapBoxSelectionOverlay();
    setMapDrawMode(null);
    applyGeographicAreaFilter(area, { openSearch: true });
  }

  function finishCustomAreaDraw(bounds) {
    if (!bounds?.isValid()) {
      clearMapBoxSelectionOverlay();
      setMapDrawMode(null);
      return;
    }

    const area = MapLocations.boundsFromLatLngBounds(bounds, 'Custom area');
    clearMapBoxSelectionOverlay();
    setMapDrawMode(null);
    applyGeographicAreaFilter(area, { openSearch: true });
  }

  function finishCustomLinePathDraw() {
    if (mapDrawState.linePoints.length < 2) {
      return;
    }

    const area = MapLocations.lineFromLatLngs(mapDrawState.linePoints, 'Custom area');
    clearMapDrawPreview();
    setMapDrawMode(null);
    applyGeographicAreaFilter(area, { openSearch: true });
  }

  function finishCustomLassoDraw() {
    mapDrawState.lassoActive = false;
    const simplified = MapLocations.simplifyDrawPath(mapDrawState.lassoPoints);
    clearMapDrawPreview();
    mapDrawState.lassoPoints = [];

    if (simplified.length < 3) {
      setMapDrawMode(null);
      return;
    }

    const latLngs = simplified.map((point) => L.latLng(point.lat, point.lon));
    const area = MapLocations.polygonFromLatLngs(latLngs, 'Custom area');
    setMapDrawMode(null);
    applyGeographicAreaFilter(area, { openSearch: true });
  }

  function finishCustomPolygonDraw() {
    if (mapDrawState.polygonPoints.length < 3) {
      return;
    }

    const area = MapLocations.polygonFromLatLngs(mapDrawState.polygonPoints, 'Custom area');
    clearMapDrawPreview();
    setMapDrawMode(null);
    applyGeographicAreaFilter(area, { openSearch: true });
  }

  function addLineDrawPoint(latlng) {
    ensureMap();
    mapDrawState.linePoints.push(latlng);
    clearMapDrawPreview();

    if (mapDrawState.linePoints.length >= 2) {
      mapDrawState.preview = L.polyline(mapDrawState.linePoints, {
        color: '#1b44b1',
        weight: 3,
        dashArray: '4 4',
      }).addTo(selectionLayer);
    }
  }

  function addPolygonDrawPoint(latlng) {
    ensureMap();
    mapDrawState.polygonPoints.push(latlng);
    clearMapDrawPreview();

    if (mapDrawState.polygonPoints.length >= 3) {
      mapDrawState.preview = L.polygon(mapDrawState.polygonPoints, {
        color: '#1b44b1',
        weight: 2,
        fillColor: '#1b44b1',
        fillOpacity: 0.12,
        dashArray: '4 4',
      }).addTo(selectionLayer);
      return;
    }

    if (mapDrawState.polygonPoints.length >= 2) {
      mapDrawState.preview = L.polyline(mapDrawState.polygonPoints, {
        color: '#1b44b1',
        weight: 2,
        dashArray: '4 4',
      }).addTo(selectionLayer);
    }
  }

  function clearMapBoxSelectionOverlay() {
    ensureMap();
    selectionLayer?.clearLayers();
    mapBoxSelect.active = false;
    mapBoxSelect.startLatLng = null;
    mapBoxSelect.startPoint = null;
    mapBoxSelect.rectangle = null;
    clearMapDrawPreview();
  }

  function finishMapBoxSelection(bounds) {
    const pins = MapLocations.spreadOverlappingPins(collectMapPins());
    const ids = new Set();
    for (const pin of pins) {
      if (bounds.contains(L.latLng(pin.geo.lat, pin.geo.lon))) {
        ids.add(pin.sourceEntity.id);
      }
    }

    clearMapBoxSelectionOverlay();
    if (map?.dragging && !map.dragging.enabled()) {
      map.dragging.enable();
    }

    if (ids.size === 0) {
      return;
    }

    setMultiSelection([...ids]);
    refreshSelectionViews();
  }

  function mountMapBoxSelection() {
    if (!map || map._boxSelectMounted) {
      return;
    }
    map._boxSelectMounted = true;

    map.on('mousedown', (event) => {
      if (mapDrawState.mode === 'polygon' && event.originalEvent.button === 0) {
        hideMapContextMenu();
        addPolygonDrawPoint(event.latlng);
        L.DomEvent.stopPropagation(event);
        L.DomEvent.preventDefault(event);
        return;
      }
      if (mapDrawState.mode === 'line' && event.originalEvent.button === 0) {
        hideMapContextMenu();
        addLineDrawPoint(event.latlng);
        L.DomEvent.stopPropagation(event);
        L.DomEvent.preventDefault(event);
        return;
      }
      if (mapDrawState.mode === 'lasso' && event.originalEvent.button === 0) {
        hideMapContextMenu();
        mapDrawState.lassoActive = true;
        mapDrawState.lassoPoints = [event.latlng];
        map.dragging.disable();
        L.DomEvent.stopPropagation(event);
        L.DomEvent.preventDefault(event);
        return;
      }
      if (
        (mapDrawState.mode === 'rectangle' || mapDrawState.mode === 'circle') &&
        event.originalEvent.button === 0
      ) {
        hideMapContextMenu();
        mapBoxSelect.active = true;
        mapBoxSelect.startLatLng = event.latlng;
        mapBoxSelect.startPoint = event.containerPoint;
        map.dragging.disable();
        L.DomEvent.stopPropagation(event);
        return;
      }
      if (event.originalEvent.button !== 0 || !event.originalEvent.shiftKey || mapDrawState.mode) {
        return;
      }
      hideMapContextMenu();
      mapBoxSelect.active = true;
      mapBoxSelect.startLatLng = event.latlng;
      mapBoxSelect.startPoint = event.containerPoint;
      map.dragging.disable();
      L.DomEvent.stopPropagation(event);
    });

    map.on('mousemove', (event) => {
      if (mapDrawState.mode === 'lasso' && mapDrawState.lassoActive) {
        mapDrawState.lassoPoints.push(event.latlng);
        if (!mapDrawState.preview) {
          mapDrawState.preview = L.polyline(mapDrawState.lassoPoints, {
            color: '#1b44b1',
            weight: 2,
            dashArray: '4 4',
          }).addTo(selectionLayer);
        } else {
          mapDrawState.preview.setLatLngs(mapDrawState.lassoPoints);
        }
        return;
      }
      if (!mapBoxSelect.active || !mapBoxSelect.startLatLng) {
        return;
      }
      if (mapDrawState.mode === 'circle') {
        const radiusMeters = Math.max(map.distance(mapBoxSelect.startLatLng, event.latlng), 1);
        if (!mapBoxSelect.rectangle) {
          mapBoxSelect.rectangle = L.circle(mapBoxSelect.startLatLng, {
            radius: radiusMeters,
            color: '#1b44b1',
            weight: 1.5,
            fillColor: '#1b44b1',
            fillOpacity: 0.12,
            dashArray: '4 4',
          }).addTo(selectionLayer);
        } else {
          mapBoxSelect.rectangle.setRadius(radiusMeters);
        }
        return;
      }
      if (!mapBoxSelect.rectangle) {
        mapBoxSelect.rectangle = L.rectangle([mapBoxSelect.startLatLng, event.latlng], {
          color: '#1b44b1',
          weight: 1.5,
          fillColor: '#1b44b1',
          fillOpacity: 0.12,
          dashArray: '4 4',
        }).addTo(selectionLayer);
      } else {
        mapBoxSelect.rectangle.setBounds(L.latLngBounds(mapBoxSelect.startLatLng, event.latlng));
      }
    });

    const finishDrag = (event) => {
      if (mapDrawState.mode === 'lasso' && mapDrawState.lassoActive) {
        finishCustomLassoDraw();
        return;
      }
      if (!mapBoxSelect.active) {
        return;
      }
      if (mapBoxSelect.rectangle) {
        if (mapDrawState.mode === 'rectangle') {
          finishCustomAreaDraw(mapBoxSelect.rectangle.getBounds());
          return;
        }
        if (mapDrawState.mode === 'circle') {
          finishCustomCircleDraw(mapBoxSelect.startLatLng, event.latlng);
          return;
        }
        finishMapBoxSelection(mapBoxSelect.rectangle.getBounds());
        return;
      }
      clearMapBoxSelectionOverlay();
      if (map.dragging && !map.dragging.enabled()) {
        map.dragging.enable();
      }
    };

    map.on('mouseup', finishDrag);
    map.on('mouseout', (event) => {
      if (mapDrawState.mode === 'lasso' && mapDrawState.lassoActive && event.originalEvent?.buttons === 0) {
        finishCustomLassoDraw();
        return;
      }
      if (mapBoxSelect.active && event.originalEvent?.buttons === 0) {
        finishDrag(event);
      }
    });
  }

  function clearMapGeographicHighlightOnInput() {
    if (state.searchFilters.geographicArea) {
      return;
    }
    if (state.activeView === 'map') {
      clearMapAreaHighlight();
    }
  }

  function submitMapGeographicSearch() {
    if (state.activeView !== 'map') {
      return;
    }

    const term = state.searchTerm.trim();
    if (!term || SmartSearchBar.isFilterCommandInput(term)) {
      return;
    }

    const area = MapLocations.findGeographicArea(term, lookup) || resolveAreaFromTerm(term);
    if (area) {
      applyGeographicAreaFilter(area);
      return;
    }

    PlaceSearch.searchPlaces(term, { viewbox: PlaceSearch.GERMANY_VIEWBOX, limit: 20 }).then((results) => {
      if (results[0]) {
        applyGeographicAreaFilter(pickBestAreaMatch(results, term) || results[0]);
      }
    });
  }

  function hasStructuredSearchFilters() {
    return (
      SearchFilters.isRestrictedTypes(state.searchFilters, objectTypes.length) ||
      state.searchFilters.attributeRules.length > 0 ||
      (state.searchFilters.roleRules?.length ?? 0) > 0 ||
      Boolean(state.searchFilters.searchFields?.size) ||
      Boolean(state.searchFilters.geographicArea)
    );
  }

  function applyVizContextMenuRelatedOptions(selectionIds, uiSource) {
    const ids = selectionIds.filter((entityId) => lookup.has(entityId));
    if (ids.length === 0) {
      return;
    }

    const settings = readRelatedSettingsFromUI(uiSource);
    if (uiSource === 'graph-menu') {
      settings.distanceMiles = getBulkRelatedSettings(ids).distanceMiles;
    }
    for (const entityId of ids) {
      applyRelatedSettingsForEntity(entityId, settings, {
        skipRender: true,
        skipPanelSync: ids.length > 1,
      });
    }

    if (ids.length === 1) {
      state.selectedId = ids[0];
      writeRelatedSettingsToUI(settings, 'panel');
    }

    if (state.activeView === 'map') {
      renderMapPins({ preserveView: true });
    } else if (state.activeView === 'graph') {
      syncGraphRelatedObjects();
      refreshSearchResults();
    }
  }

  function applyContextMenuRelatedOptions() {
    applyVizContextMenuRelatedOptions(mapContextSelectionIds, 'menu');
  }

  function applyGraphContextMenuRelatedOptions() {
    applyVizContextMenuRelatedOptions(graphContextSelectionIds, 'graph-menu');
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
          distanceMiles:
            options.distanceMiles !== undefined
              ? options.distanceMiles
              : parseDistanceMiles(els.relatedDistance.value),
        });
      }
    }

    if (ids.length > 0) {
      state.selectedId = ids[ids.length - 1];
      syncRelatedOptionsFromSelection();
    }

    ensureMap();
    if (options.switchView !== false) {
      switchView('map', { mapRenderOptions: { fitAll: true, ...options } });
    } else {
      renderMapPins({ fitAll: options.fitAll ?? true, ...options });
    }
    refreshSearchResults();
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
    return SearchFilters.filterEntities(
      entities,
      term,
      state.searchFilters,
      objectTypes,
      lookup,
      relations,
      roleCatalog.index
    );
  }

  function hasSearchCriteria() {
    return SearchFilters.hasActiveCriteria(state.searchTerm, state.searchFilters, objectTypes.length);
  }

  function isVizDropdownCommandActive() {
    if (VizSearchVariant.get() !== 'dropdown') {
      return false;
    }
    if (document.documentElement.classList.contains('viz-filter-command-active')) {
      return true;
    }
    const menu = document.getElementById('viz-search-menu');
    if (SmartSearchBar.isCommandMenuOpen(menu)) {
      return true;
    }
    const input = els.vizSearchInput;
    return Boolean(input && SmartSearchBar.isFilterCommandInput(input.value));
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
      if (isVizDropdownCommandActive()) {
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
    if (VizSearchVariant.get() === 'dropdown') {
      const ctx = getVizSearchContext();
      if (ctx) {
        if (isVizDropdownCommandActive()) {
          VizSearchVariant.updateOpenState(false, ctx);
        } else if (state.vizSearchSessionOpen && hasSearchCriteria()) {
          VizSearchVariant.updateOpenState(true, ctx);
        }
      }
      VizSearchVariant.syncDropdownHostPosition(ctx || state.vizSearchContext);
    }
    refreshSearchResults();
    schedulePlaceSearchFromInput();
    if (state.searchFilters.geographicArea) {
      syncGeographicAreaHighlight();
    } else if (state.activeView === 'map') {
      clearMapAreaHighlight();
    }
    syncGeographicAreaToUrl();
    syncShareAreaUi();
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
      if (isEntityOnMap(entityId)) {
        const pinnedId = getMapPinToggleId(entityId);
        if (pinnedId) {
          unpinEntityFromMap(pinnedId);
          afterVizRemove('map');
        }
      } else {
        pinEntityOnMap(entityId, { stayOnMap: true });
        afterVizAdd('map');
      }
      return;
    }

    if (context === 'graph') {
      if (isEntityOnGraph(entityId)) {
        const graphId = getGraphToggleId(entityId);
        if (graphId) {
          removeEntityFromGraph(graphId);
          afterVizRemove('graph');
        }
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

  function applyResultGroupCollapsedState(section, collapsed) {
    const header = section.querySelector('.search-result-group__header');
    const body = section.querySelector('.search-result-group__body');
    const chevron = header?.querySelector('.search-result-group__chevron');
    if (body) {
      body.hidden = collapsed;
    }
    if (header) {
      header.setAttribute('aria-expanded', String(!collapsed));
    }
    if (chevron) {
      chevron.classList.toggle('search-result-group__chevron--collapsed', collapsed);
    }
  }

  function syncCollapsedResultGroupsInDom() {
    for (const container of [els.searchResults, els.vizSearchResults]) {
      if (!container) {
        continue;
      }
      for (const section of container.querySelectorAll('.search-result-group[data-result-group]')) {
        applyResultGroupCollapsedState(
          section,
          state.collapsedResultGroups.has(section.dataset.resultGroup)
        );
      }
    }
  }

  function toggleResultGroup(typeId) {
    if (state.collapsedResultGroups.has(typeId)) {
      state.collapsedResultGroups.delete(typeId);
    } else {
      state.collapsedResultGroups.add(typeId);
    }
    syncCollapsedResultGroupsInDom();
  }

  function handleAreaResultSelect(area, context) {
    applyGeographicAreaFilter(area);
    if (context === 'search' || context === 'map') {
      if (state.activeView !== 'map') {
        switchView('map');
      }
      state.vizSearchSessionOpen = true;
      VizSearchVariant.updateOpenState(true, 'map');
    } else if (context === 'graph') {
      state.vizSearchSessionOpen = true;
      VizSearchVariant.updateOpenState(true, 'graph');
    }
  }

  function buildAreaResultRow(area, context) {
    const row = document.createElement('div');
    const active = state.searchFilters.geographicArea?.id === area.id;
    row.className = `result-row result-row--area${active ? ' result-row--area-active' : ''}`;
    row.innerHTML = `
      <span class="result-row__icon result-row__icon--area" aria-hidden="true">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="#1b44b1" stroke-width="1.6">
          <path d="M4 8.5 9 4.5l6 1.5 5 3v8.5l-5-2.5-6-1.5-5 2.5V8.5Z"/>
        </svg>
      </span>
      <div class="result-row__content">
        <div class="result-row__title">${area.label}</div>
        <div class="result-row__match">${area.displayName || area.placeType || 'Geographic area'}</div>
      </div>
      ${active ? '<span class="result-row__status">Active</span>' : ''}
    `;
    row.addEventListener('click', () => handleAreaResultSelect(area, context));
    return row;
  }

  function renderAreaResultsSection(areas, container, context) {
    if (areas.length === 0) {
      return;
    }

    const section = document.createElement('section');
    section.className = 'search-result-group search-result-group--areas';
    section.dataset.resultGroup = GEOGRAPHIC_AREAS_GROUP_ID;
    const collapsed = state.collapsedResultGroups.has(GEOGRAPHIC_AREAS_GROUP_ID);

    const header = document.createElement('button');
    header.type = 'button';
    header.className = 'search-result-group__header';
    header.setAttribute('aria-expanded', String(!collapsed));
    header.innerHTML = `
      <span class="search-result-group__chevron${collapsed ? ' search-result-group__chevron--collapsed' : ''}" aria-hidden="true">▾</span>
      <span class="search-result-group__type-icon" aria-hidden="true">
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#1b44b1" stroke-width="1.6">
          <path d="M4 8.5 9 4.5l6 1.5 5 3v8.5l-5-2.5-6-1.5-5 2.5V8.5Z"/>
        </svg>
      </span>
      <span class="search-result-group__label">Geographic areas</span>
      <span class="search-result-group__count">(${areas.length})</span>
    `;
    header.addEventListener('click', (event) => {
      event.stopPropagation();
      toggleResultGroup(GEOGRAPHIC_AREAS_GROUP_ID);
    });

    const body = document.createElement('div');
    body.className = 'search-result-group__body';
    body.hidden = collapsed;
    for (const area of areas) {
      body.appendChild(buildAreaResultRow(area, context));
    }

    section.appendChild(header);
    section.appendChild(body);
    container.appendChild(section);
  }

  function buildResultCard(entity, context, options = {}) {
    const groupedList = options.groupedList === true;
    const highlighted = isSelectionHighlighted(entity.id);
    const card = document.createElement('div');
    const match = SearchFilters.resolveResultMatch(
      entity,
      state.searchTerm,
      state.searchFilters,
      lookup,
      roleCatalog.index
    );
    const onMap = isEntityOnMap(entity.id, options.mapPresence);
    const onGraph = isEntityOnGraph(entity.id, options.graphPresence);
    const color = typeColors[entity.type] || '#1b44b1';

    if (groupedList) {
      let status = '';
      let onViz = false;
      const showMapTag = (context === 'map' || options.mapPresence) && onMap;
      const showGraphTag = (context === 'graph' || options.graphPresence) && onGraph;
      if (showMapTag) {
        status = '<span class="result-row__status">On map</span>';
        onViz = true;
      } else if (showGraphTag) {
        status = '<span class="result-row__status">On graph</span>';
        onViz = true;
      }

      card.className = `result-row${highlighted ? ' result-row--selected' : ''}${
        showMapTag ? ' result-row--on-map' : ''
      }${showGraphTag ? ' result-row--on-graph' : ''}`;
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
      card.addEventListener('click', (event) => {
        event.stopPropagation();
        handleSearchResultSelect(entity.id, context, event);
      });
      if (context === 'map' || context === 'graph') {
        card.addEventListener('contextmenu', (event) => {
          event.preventDefault();
          const menuOptions = { detailsOnly: true };
          if (context === 'map') {
            showMapContextMenu(entity.id, event.clientX, event.clientY, null, menuOptions);
          } else {
            showGraphContextMenu(entity.id, event.clientX, event.clientY, null, menuOptions);
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
    } else if ((context === 'map' || options.mapPresence) && onMap) {
      footer = '<span class="result-card__status">On map</span>';
    } else if ((context === 'graph' || options.graphPresence) && onGraph) {
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

    card.addEventListener('click', (event) => {
      event.stopPropagation();
      handleSearchResultSelect(entity.id, context, event);
    });

    if (context === 'map' || context === 'graph') {
      card.addEventListener('contextmenu', (event) => {
        event.preventDefault();
        const menuOptions = { detailsOnly: true };
        if (context === 'map') {
          showMapContextMenu(entity.id, event.clientX, event.clientY, null, menuOptions);
        } else {
          showGraphContextMenu(entity.id, event.clientX, event.clientY, null, menuOptions);
        }
      });
    }

    const addGraphButton = card.querySelector('.result-card__add-graph');
    if (addGraphButton) {
      addGraphButton.addEventListener('click', (event) => {
        event.stopPropagation();
        addToGraph(entity.id, { switchView: true });
      });
    }

    return card;
  }

  function getVizEmptyStateOptions(context) {
    const options = { context };
    if (VizSearchVariant.get() === 'dropdown') {
      options.layout = 'dropdown';
    }
    return options;
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

    const matchingAreas = context === 'map' ? getMatchingGeographicAreas() : [];
    const hasEntityResults = items.length > 0;

    if (!hasEntityResults && matchingAreas.length === 0) {
      const variant = hasSearchCriteria() ? 'search-no-results' : 'search-idle';
      const emptyOptions =
        container.id === 'viz-search-results' ? getVizEmptyStateOptions(context) : { context };
      container.innerHTML = EmptyStates.render(variant, emptyOptions);
      return;
    }

    if (matchingAreas.length > 0) {
      renderAreaResultsSection(matchingAreas, container, context);
    }

    if (!hasEntityResults) {
      return;
    }

    const mapPresence =
      context === 'map' || (context === 'search' && state.activeView === 'map')
        ? buildMapPresenceIndex()
        : null;
    const graphPresence =
      context === 'graph' || (context === 'search' && state.activeView === 'graph')
        ? buildGraphPresenceIndex()
        : null;

    for (const group of groupResultsByType(items)) {
      const section = document.createElement('section');
      section.className = 'search-result-group';
      section.dataset.resultGroup = group.type;
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
      header.addEventListener('click', (event) => {
        event.stopPropagation();
        toggleResultGroup(group.type);
      });

      const body = document.createElement('div');
      body.className = 'search-result-group__body';
      body.hidden = collapsed;

      for (const entity of group.items) {
        body.appendChild(
          buildResultCard(entity, context, { groupedList: true, mapPresence, graphPresence })
        );
      }

      section.appendChild(header);
      section.appendChild(body);
      container.appendChild(section);
    }
  }

  function renderSearchResults(items, container, context) {
    renderGroupedSearchResults(items, container, context);
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
        <td>${DisplayNames.formatAttributeValue(row.value, row.fieldId)}</td>
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

  function isMapViewVisible() {
    const view = document.getElementById('view-map');
    if (!view?.classList.contains('active')) {
      return false;
    }
    const mapEl = document.getElementById('map');
    if (!mapEl) {
      return false;
    }
    const rect = mapEl.getBoundingClientRect();
    return rect.width > 8 && rect.height > 8;
  }

  function fitMapToPins(pinBounds, options = {}) {
    if (!pinBounds?.isValid()) {
      return;
    }

    map.fitBounds(pinBounds, {
      padding: [48, 48],
      maxZoom: 16,
      animate: options.animate !== false,
    });
    updateMapZoomLabel();
  }

  function applyMapPinView(previousBounds, pinBounds, savedCenter, savedZoom, options = {}) {
    const shouldFit =
      options.fitAll === true ||
      options.preserveView === false ||
      !isMapViewVisible() ||
      savedZoom < MAP_BASE_ZOOM - 4;

    if (!shouldFit && shouldPreserveMapView(previousBounds, pinBounds, options, savedZoom)) {
      map.setView(savedCenter, savedZoom, { animate: false });
      updateMapZoomLabel();
      return;
    }

    fitMapToPins(pinBounds, options);
  }
  function shouldPreserveMapView(previousBounds, pinBounds, options, savedZoom = MAP_BASE_ZOOM) {
    if (options.preserveView === false || options.fitAll === true) {
      return false;
    }
    if (options.preserveView !== true && !isMapViewVisible()) {
      return false;
    }
    if (savedZoom < MAP_BASE_ZOOM - 4) {
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
            title: DisplayNames.formatMapPinTooltip(pin),
            selected: isSelectionHighlighted(pin.sourceEntity.id),
          }),
          iconSize: [32, 32],
          iconAnchor: [16, 16],
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
          hideMapContextMenu();
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
      const applyView = () => applyMapPinView(previousBounds, pinBounds, savedCenter, savedZoom, options);

      if (!isMapViewVisible()) {
        refreshMapSize();
        requestAnimationFrame(() => {
          refreshMapSize();
          requestAnimationFrame(applyView);
        });
      } else {
        applyView();
        refreshMapSize();
      }
      return;
    }

    refreshMapSize();
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

  function getGraphDragNodeIds(anchorId) {
    if (state.multiSelectedIds.size > 1 && state.multiSelectedIds.has(anchorId)) {
      return [...state.multiSelectedIds].filter((id) => graphState.positions.has(id));
    }
    return graphState.positions.has(anchorId) ? [anchorId] : [];
  }

  function captureGraphDragStartPositions(nodeIds) {
    const positions = new Map();
    for (const id of nodeIds) {
      const position = graphState.positions.get(id);
      if (position) {
        positions.set(id, { x: position.x, y: position.y });
      }
    }
    return positions;
  }

  function moveGraphDragNodes(anchorId, point) {
    const anchorStart = graphInteraction.dragStartPositions?.get(anchorId);
    if (!anchorStart || !graphInteraction.nodeOffset) {
      return;
    }

    const deltaX = point.x - graphInteraction.nodeOffset.x - anchorStart.x;
    const deltaY = point.y - graphInteraction.nodeOffset.y - anchorStart.y;

    for (const id of graphInteraction.dragNodeIds || [anchorId]) {
      const start = graphInteraction.dragStartPositions?.get(id);
      if (!start) {
        continue;
      }
      GraphView.setNodePosition(graphState, id, start.x + deltaX, start.y + deltaY);
    }
  }

  function getGraphFrameElement() {
    return els.graphSvg?.closest('.graph-frame__body') || els.graphSvg?.closest('.graph-frame');
  }

  function clearGraphBoxSelectOverlay() {
    if (!els.graphBoxSelect) {
      return;
    }
    els.graphBoxSelect.classList.add('hidden');
    els.graphBoxSelect.style.width = '0';
    els.graphBoxSelect.style.height = '0';
  }

  function updateGraphBoxSelectOverlay(startClient, currentClient) {
    const frame = getGraphFrameElement();
    if (!frame || !els.graphBoxSelect) {
      return;
    }

    const rect = frame.getBoundingClientRect();
    const left = Math.min(startClient.x, currentClient.x) - rect.left;
    const top = Math.min(startClient.y, currentClient.y) - rect.top;
    const width = Math.abs(currentClient.x - startClient.x);
    const height = Math.abs(currentClient.y - startClient.y);

    els.graphBoxSelect.style.left = `${left}px`;
    els.graphBoxSelect.style.top = `${top}px`;
    els.graphBoxSelect.style.width = `${width}px`;
    els.graphBoxSelect.style.height = `${height}px`;
    els.graphBoxSelect.classList.remove('hidden');
  }

  function finishGraphBoxSelection(startClient, endClient) {
    clearGraphBoxSelectOverlay();

    const width = Math.abs(endClient.x - startClient.x);
    const height = Math.abs(endClient.y - startClient.y);
    if (width < 4 && height < 4) {
      return;
    }

    const startGraph = clientToGraphPoint(startClient.x, startClient.y);
    const endGraph = clientToGraphPoint(endClient.x, endClient.y);
    const minX = Math.min(startGraph.x, endGraph.x);
    const maxX = Math.max(startGraph.x, endGraph.x);
    const minY = Math.min(startGraph.y, endGraph.y);
    const maxY = Math.max(startGraph.y, endGraph.y);
    const ids = [];

    for (const nodeId of graphState.nodeIds) {
      const position = graphState.positions.get(nodeId);
      if (!position) {
        continue;
      }
      if (position.x >= minX && position.x <= maxX && position.y >= minY && position.y <= maxY) {
        ids.push(nodeId);
      }
    }

    if (ids.length === 0) {
      return;
    }

    setMultiSelection(ids);
    refreshSelectionViews();
  }

  function syncGraphDomPositions() {
    for (const [id, pos] of graphState.positions.entries()) {
      const node = els.graphSvg.querySelector(`[data-entity-id="${id}"]`);
      if (node) {
        node.setAttribute('transform', `translate(${pos.x}, ${pos.y})`);
      }
    }

    for (const group of els.graphSvg.querySelectorAll('.graph-link-group')) {
      const from = graphState.positions.get(group.dataset.from);
      const to = graphState.positions.get(group.dataset.to);
      if (!from || !to) {
        continue;
      }

      const x1 = from.x;
      const y1 = from.y + 8;
      const x2 = to.x;
      const y2 = to.y + 8;
      const line = group.querySelector('.graph-link');
      if (line) {
        line.setAttribute('x1', x1);
        line.setAttribute('y1', y1);
        line.setAttribute('x2', x2);
        line.setAttribute('y2', y2);
      }

      const label = group.querySelector('.graph-link__label');
      if (label) {
        label.setAttribute('transform', `translate(${(x1 + x2) / 2}, ${(y1 + y2) / 2})`);
      }
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
    graphInteraction.dragNodeIds = null;
    graphInteraction.dragStartPositions = null;
    graphInteraction.boxSelectStart = null;
    clearGraphBoxSelectOverlay();
    els.graphSvg.classList.remove('graph-svg--panning', 'graph-svg--dragging-node', 'graph-svg--box-select');
  }

  function hideGraphNodeTooltip() {
    els.graphNodeTooltip.classList.add('hidden');
    els.graphNodeTooltip.setAttribute('aria-hidden', 'true');
  }

  function positionGraphTooltip(clientX, clientY) {
    const frame = els.graphSvg.closest('.graph-frame');
    if (!frame) {
      return;
    }

    const rect = frame.getBoundingClientRect();
    els.graphNodeTooltip.style.left = `${clientX - rect.left}px`;
    els.graphNodeTooltip.style.top = `${clientY - rect.top}px`;
  }

  function showGraphNodeTooltip(entity, clientX, clientY) {
    if (!entity) {
      return;
    }

    els.graphNodeTooltip.innerHTML = DisplayNames.formatObjectTooltipHtml(
      DisplayNames.displayName(entity, lookup),
      entity.type
    );
    positionGraphTooltip(clientX, clientY);
    els.graphNodeTooltip.classList.remove('hidden');
    els.graphNodeTooltip.setAttribute('aria-hidden', 'false');
  }

  function showGraphLinkLabelTooltip(labelGroup, clientX, clientY) {
    const fullLabel = String(labelGroup?.dataset?.fullLabel || '').trim();
    if (!fullLabel) {
      return;
    }

    const displayed =
      labelGroup.querySelector('.graph-link__label-text')?.textContent?.trim() || '';
    if (fullLabel === displayed && !displayed.endsWith('…')) {
      return;
    }

    els.graphNodeTooltip.textContent = fullLabel;
    positionGraphTooltip(clientX, clientY);
    els.graphNodeTooltip.classList.remove('hidden');
    els.graphNodeTooltip.setAttribute('aria-hidden', 'false');
  }

  function moveGraphNodeTooltip(clientX, clientY) {
    if (els.graphNodeTooltip.classList.contains('hidden')) {
      return;
    }

    positionGraphTooltip(clientX, clientY);
  }

  function hideGraphContextMenu() {
    els.graphContextMenu.classList.add('hidden');
    graphContextEntityId = null;
    graphContextSelectionIds = [];
    if (openMenuRelatedFlyoutContext === 'graph') {
      closeMenuRelatedFlyouts();
    }
    if (openContextMenuState?.menu === els.graphContextMenu) {
      openContextMenuState = null;
    }
    hideGraphNodeTooltip();
  }

  function hideMapContextMenu() {
    els.mapContextMenu.classList.add('hidden');
    mapContextEntityId = null;
    mapContextSelectionIds = [];
    closeMenuRelatedFlyouts();
    if (openContextMenuState?.menu === els.mapContextMenu) {
      openContextMenuState = null;
    }
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

  function isContextMenuOpen(menu) {
    return Boolean(menu && !menu.classList.contains('hidden'));
  }

  function isContextMenuTarget(target) {
    if (!target?.closest) {
      return false;
    }
    return Boolean(
      target.closest('#map-context-menu') ||
        target.closest('#graph-context-menu') ||
        target.closest('#menu-related-filters-flyout') ||
        target.closest('#graph-menu-related-filters-flyout')
    );
  }

  function dismissOpenContextMenus(event) {
    if (isContextMenuTarget(event.target)) {
      return;
    }

    if (isContextMenuOpen(els.mapContextMenu)) {
      hideMapContextMenu();
    }
    if (isContextMenuOpen(els.graphContextMenu)) {
      hideGraphContextMenu();
    }
  }

  function mountContextMenus() {
    for (const menu of [
      els.mapContextMenu,
      els.graphContextMenu,
      els.menuRelatedFiltersFlyout,
      els.graphMenuRelatedFiltersFlyout,
    ]) {
      if (menu && menu.parentElement !== document.body) {
        document.body.appendChild(menu);
      }
    }

    document.addEventListener('pointerdown', (event) => {
      dismissOpenContextMenus(event);
    }, true);

    document.addEventListener('click', (event) => {
      if (els.relatedTypeFilters && !els.relatedTypeFilters.contains(event.target)) {
        closeRelatedTypeMultiselect(els.relatedTypeFilters);
      }
      if (els.menuRelatedTypeFilters && !els.menuRelatedTypeFilters.contains(event.target)) {
        closeRelatedTypeMultiselect(els.menuRelatedTypeFilters);
      }
      if (els.graphMenuRelatedTypeFilters && !els.graphMenuRelatedTypeFilters.contains(event.target)) {
        closeRelatedTypeMultiselect(els.graphMenuRelatedTypeFilters);
      }

      const inMapMenu = els.mapContextMenu?.contains(event.target);
      const inMapFlyout = els.menuRelatedFiltersFlyout?.contains(event.target);
      const inGraphMenu = els.graphContextMenu?.contains(event.target);
      const inGraphFlyout = els.graphMenuRelatedFiltersFlyout?.contains(event.target);

      if (openMenuRelatedFlyoutContext === 'map' && !inMapMenu && !inMapFlyout) {
        closeMenuRelatedFlyouts();
      }
      if (openMenuRelatedFlyoutContext === 'graph' && !inGraphMenu && !inGraphFlyout) {
        closeMenuRelatedFlyouts();
      }

      dismissOpenContextMenus(event);
    });
  }

  let lastMapContextPoint = { x: 0, y: 0 };
  let openContextMenuState = null;

  function positionContextMenu(menu, clientX, clientY) {
    if (!menu) {
      return;
    }

    menu.style.position = 'fixed';
    menu.style.left = `${clientX}px`;
    menu.style.top = `${clientY}px`;
    menu.style.right = 'auto';
    menu.style.bottom = 'auto';
    menu.style.zIndex = '10000';

    const padding = 8;
    const maxHeight = window.innerHeight - padding * 2;
    const rect = menu.getBoundingClientRect();
    const menuHeight = Math.min(rect.height, maxHeight);
    let left = clientX;
    let top = clientY;

    if (left + rect.width > window.innerWidth - padding) {
      left = window.innerWidth - rect.width - padding;
    }
    left = Math.max(padding, left);

    if (top + menuHeight > window.innerHeight - padding) {
      const flippedTop = clientY - menuHeight;
      top =
        flippedTop >= padding
          ? flippedTop
          : Math.max(padding, window.innerHeight - menuHeight - padding);
    }
    top = Math.max(padding, top);

    menu.style.left = `${left}px`;
    menu.style.top = `${top}px`;
  }

  function refreshOpenContextMenuPosition() {
    if (!openContextMenuState?.menu || openContextMenuState.menu.classList.contains('hidden')) {
      return;
    }
    positionContextMenu(
      openContextMenuState.menu,
      openContextMenuState.x,
      openContextMenuState.y
    );

    if (openMenuRelatedFlyoutContext) {
      positionMenuRelatedFlyout(openMenuRelatedFlyoutContext);
    }
  }

  function openContextMenu(menu, clientX, clientY) {
    if (!menu) {
      return;
    }

    openContextMenuState = { menu, x: clientX, y: clientY };
    menu.classList.remove('hidden');
    positionContextMenu(menu, clientX, clientY);
    requestAnimationFrame(() => {
      refreshOpenContextMenuPosition();
    });
  }

  function setContextMenuItemsVisibility(menu, itemIds, dividerHidden) {
    for (const id of itemIds) {
      document.getElementById(id)?.classList.toggle('hidden', dividerHidden);
    }
    menu?.querySelector('.context-menu__divider')?.classList.toggle('hidden', dividerHidden);
  }

  function showGraphContextMenu(entityId, clientX, clientY, selectionSnapshot = null, options = {}) {
    const detailsOnly = options.detailsOnly === true;
    hideMapContextMenu();
    prepareContextSelection(entityId);
    graphContextEntityId = entityId;
    graphContextSelectionIds = detailsOnly
      ? [entityId]
      : selectionSnapshot && selectionSnapshot.length > 1
        ? resolveBulkEntityIds(selectionSnapshot)
        : getContextSelectionIds();
    const count = graphContextSelectionIds.length;
    const isMulti = count > 1;
    const settings =
      count === 1 ? getPinSettings(entityId) : getBulkRelatedSettings(graphContextSelectionIds);
    const divider = els.graphContextMenu?.querySelector('.context-menu__divider:not(#graph-context-related-divider)');

    setContextMenuLabel(els.graphContextMap, 'Show on map', count);
    setContextMenuLabel(els.graphContextDetails, 'Open object details', count);
    setContextMenuLabel(els.graphContextRemove, 'Remove object', count);

    if (detailsOnly) {
      els.graphContextDetails.classList.remove('hidden');
      els.graphContextRelatedSection.classList.add('hidden');
      els.graphContextRelatedDivider.classList.add('hidden');
      els.graphContextMap.classList.add('hidden');
      els.graphContextRemove.classList.add('hidden');
      divider?.classList.add('hidden');
    } else if (isMulti) {
      els.graphContextDetails.classList.add('hidden');
      els.graphContextRelatedSection.classList.remove('hidden');
      els.graphContextRelatedDivider.classList.remove('hidden');
      els.graphContextRelatedLabel.textContent = `Show related objects (${count} selected)`;
      writeRelatedSettingsToUI(settings, 'graph-menu');
      els.graphContextMap.classList.remove('hidden');
      els.graphContextRemove.classList.remove('hidden');
      divider?.classList.remove('hidden');
    } else {
      els.graphContextDetails.classList.remove('hidden');
      els.graphContextRelatedSection.classList.remove('hidden');
      els.graphContextRelatedDivider.classList.remove('hidden');
      els.graphContextRelatedLabel.textContent = 'Show related objects';
      writeRelatedSettingsToUI(settings, 'graph-menu');
      els.graphContextMap.classList.remove('hidden');
      els.graphContextRemove.classList.remove('hidden');
      divider?.classList.remove('hidden');
    }

    openContextMenu(els.graphContextMenu, clientX, clientY);
  }

  function showMapContextMenu(entityId, clientX, clientY, selectionSnapshot = null, options = {}) {
    const detailsOnly = options.detailsOnly === true;
    hideGraphContextMenu();
    prepareContextSelection(entityId);
    mapContextEntityId = entityId;
    mapContextSelectionIds = detailsOnly
      ? [entityId]
      : selectionSnapshot && selectionSnapshot.length > 1
        ? resolveBulkEntityIds(selectionSnapshot)
        : getContextSelectionIds();
    const count = mapContextSelectionIds.length;
    const isMulti = count > 1;
    const settings =
      count === 1 ? getPinSettings(entityId) : getBulkRelatedSettings(mapContextSelectionIds);
    lastMapContextPoint = { x: clientX, y: clientY };

    setContextMenuLabel(els.mapContextGraph, 'Add to graph', count);
    setContextMenuLabel(els.mapContextDetails, 'Open object details', count);
    setContextMenuLabel(els.mapContextRemove, 'Remove object', count);

    if (detailsOnly) {
      els.mapContextDetails.classList.remove('hidden');
      els.mapContextRelatedSection.classList.add('hidden');
      els.mapContextRelatedDivider.classList.add('hidden');
      setContextMenuItemsVisibility(
        els.mapContextMenu,
        ['map-context-graph', 'map-context-remove'],
        true
      );
    } else if (isMulti) {
      els.mapContextDetails.classList.add('hidden');
      els.mapContextRelatedSection.classList.remove('hidden');
      els.mapContextRelatedDivider.classList.remove('hidden');
      els.mapContextRelatedLabel.textContent = `Show related objects (${count} selected)`;
      writeRelatedSettingsToUI(settings, 'menu');
      setContextMenuItemsVisibility(
        els.mapContextMenu,
        ['map-context-graph', 'map-context-remove'],
        false
      );
    } else {
      els.mapContextDetails.classList.remove('hidden');
      els.mapContextRelatedSection.classList.remove('hidden');
      els.mapContextRelatedDivider.classList.remove('hidden');
      els.mapContextRelatedLabel.textContent = 'Show related objects';
      writeRelatedSettingsToUI(settings, 'menu');
      setContextMenuItemsVisibility(
        els.mapContextMenu,
        ['map-context-graph', 'map-context-remove'],
        false
      );
    }

    openContextMenu(els.mapContextMenu, clientX, clientY);
  }

  function renderGraphView() {
    const hasNodes = graphState.nodeIds.size > 0;
    els.graphCaption.style.display = hasNodes ? 'none' : '';
    if (!hasNodes) {
      GraphView.clearGraphSvg(els.graphSvg);
      els.graphCaption.innerHTML = EmptyStates.render('graph-empty');
      return;
    }

    refreshGraphLinks();

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

    if (options.skipPrune) {
      if (!options.skipRender) {
        renderGraphView();
        refreshSearchResults();
      }
      return true;
    }

    reconcileGraphAfterRemoval(options);
    return true;
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

  function isMapGeographicSearchEnabled() {
    return getVizSearchContext() === 'map';
  }

  function shouldShowVizResultsPanel() {
    if (state.activeView !== 'map' && state.activeView !== 'graph') {
      return false;
    }
    if (isVizDropdownCommandActive()) {
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
        els.vizSearchResults.innerHTML = EmptyStates.render(
          'search-viz',
          getVizEmptyStateOptions(vizContext)
        );
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
    renderMenuRelatedTypeFilters(null, 'map');
    renderMenuRelatedTypeFilters(null, 'graph');
  }

  function syncWorkbenchTabs() {
    for (const tab of [els.workbenchTabExplorer, els.workbenchTabNewObject]) {
      if (!tab) {
        continue;
      }
      const assetName = tab.dataset.asset;
      const isOpen = state.openWorkbenchAssets.has(assetName);
      tab.classList.toggle('hidden', !isOpen);
      tab.classList.toggle('workbench-tab--active', isOpen && state.activeAsset === assetName);
      tab.setAttribute('aria-selected', isOpen && state.activeAsset === assetName ? 'true' : 'false');
    }
  }

  function closeWorkbenchAsset(assetName) {
    if (!state.openWorkbenchAssets.has(assetName) || state.openWorkbenchAssets.size <= 1) {
      return;
    }

    if (assetName === 'new-object') {
      closeInstancePanel();
      finishVizSearchSession({ clearSearch: false });
      hideMapContextMenu();
      hideGraphContextMenu();
      hideGraphNodeTooltip();
    }

    if (assetName === 'object-explorer' && mapDrawState.mode) {
      setMapDrawMode(null);
    }

    state.openWorkbenchAssets.delete(assetName);

    if (state.activeAsset === assetName) {
      const fallback = [...state.openWorkbenchAssets][0];
      switchAsset(fallback);
      return;
    }

    syncWorkbenchTabs();
  }

  function initAssetNavigation() {
    const resolveAssetControl = (target) => {
      const element = target instanceof Element ? target : target?.parentElement;
      if (!element) {
        return null;
      }
      if (element.closest('.workbench-tab__close')) {
        return { kind: 'close', control: element.closest('.workbench-tab[data-asset]') };
      }
      const workbenchTab = element.closest('.workbench-tab[data-asset]');
      if (workbenchTab) {
        return { kind: 'switch', control: workbenchTab };
      }
      const packageItem = element.closest('.package-nav-item[data-asset]');
      if (packageItem) {
        return { kind: 'switch', control: packageItem };
      }
      return null;
    };

    document.querySelector('.workbench-tabs')?.addEventListener('click', (event) => {
      const resolved = resolveAssetControl(event.target);
      if (!resolved?.control?.dataset.asset) {
        return;
      }

      event.preventDefault();
      if (resolved.kind === 'close') {
        event.stopPropagation();
        closeWorkbenchAsset(resolved.control.dataset.asset);
        return;
      }

      switchAsset(resolved.control.dataset.asset);
    });

    document.querySelectorAll('.package-nav-item[data-asset]').forEach((item) => {
      item.addEventListener('click', () => switchAsset(item.dataset.asset));
    });
  }

  function switchAsset(assetName) {
    if (assetName !== 'object-explorer' && assetName !== 'new-object') {
      return;
    }

    if (!state.openWorkbenchAssets.has(assetName)) {
      state.openWorkbenchAssets.add(assetName);
    }

    state.activeAsset = assetName;

    document.querySelectorAll('.package-nav-item[data-asset]').forEach((item) => {
      item.classList.toggle('package-nav-item--active', item.dataset.asset === assetName);
    });

    syncWorkbenchTabs();

    els.workbenchAssetExplorer?.classList.toggle('workbench-asset--active', assetName === 'object-explorer');
    els.workbenchAssetNewObject?.classList.toggle('workbench-asset--active', assetName === 'new-object');
    els.objectTypeNav?.classList.toggle('hidden', assetName !== 'object-explorer');

    if (assetName === 'new-object') {
      closeInstancePanel();
      finishVizSearchSession({ clearSearch: false });
      hideMapContextMenu();
      hideGraphContextMenu();
      hideGraphNodeTooltip();
      syncShareAreaUi();
      return;
    }

    if (state.activeView === 'map') {
      ensureMap();
      refreshMapSize();
      if (state.pinnedIds.size > 0) {
        renderMapPins({ preserveView: true });
      }
    }
    if (state.activeView === 'graph') {
      renderGraphView();
    }
  }

  function switchView(viewName, options = {}) {
    if (state.activeAsset !== 'object-explorer') {
      return;
    }
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
      if (state.pinnedIds.size > 0 && !options.skipMapRender) {
        renderMapPins(options.mapRenderOptions || {});
      }
      activateVizSearchForView('map');
      syncGeographicAreaHighlight();
      syncShareAreaUi();
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
      if (mapDrawState.mode) {
        event.preventDefault();
        setMapDrawMode(null);
        return;
      }
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
    state.pinSettings.set(state.selectedId, readRelatedSettingsFromUI('panel'));
    closeInstancePanel();
    pinEntityOnMap(state.selectedId, {
      showRelated: els.showRelatedObjects.checked,
      ...readRelatedSettingsFromUI('panel'),
    });
  });

  els.showRelatedObjects.addEventListener('change', applyRelatedOptionsForSelection);
  els.relatedTimePeriod.addEventListener('change', applyRelatedOptionsForSelection);
  els.relatedDistance.addEventListener('change', applyRelatedOptionsForSelection);

  els.mapShowHeatmap.addEventListener('change', applyHeatmapSettings);

  els.btnAddGraph.addEventListener('click', () => {
    if (!state.selectedId) {
      return;
    }
    addToGraph(state.selectedId, { switchView: true });
    closeInstancePanel();
  });

  els.btnShareArea?.addEventListener('click', () => {
    void shareGeographicAreaLink();
  });

  els.btnClearMap.addEventListener('click', () => {
    state.pinnedIds.clear();
    state.pinSettings.clear();
    hideMapContextMenu();
    setMapDrawMode(null);
    ensureMap();
    clearMapAreaHighlight();
    areaLayer?.clearLayers();
    renderMapPins();
    refreshSearchResults();
  });

  els.btnDrawArea?.addEventListener('click', (event) => {
    event.stopPropagation();
    if (mapDrawState.mode) {
      return;
    }
    toggleMapAreaToolsMenu();
  });

  els.mapAreaToolsMenu?.querySelectorAll('[data-draw-mode]').forEach((button) => {
    button.addEventListener('click', (event) => {
      event.stopPropagation();
      const mode = button.dataset.drawMode;
      setMapDrawMode(mapDrawState.mode === mode ? null : mode);
      closeMapAreaToolsMenu();
    });
  });

  document.addEventListener('click', (event) => {
    if (!els.mapAreaTools?.contains(event.target)) {
      closeMapAreaToolsMenu();
    }
  });
  els.btnFinishAreaShape?.addEventListener('click', () => {
    if (mapDrawState.mode === 'line') {
      finishCustomLinePathDraw();
      return;
    }
    finishCustomPolygonDraw();
  });
  els.btnCancelAreaDraw?.addEventListener('click', () => {
    setMapDrawMode(null);
  });

  els.btnGraphClear.addEventListener('click', clearGraphView);

  els.graphContextDetails.addEventListener('click', (event) => {
    event.stopPropagation();
    const entityId = takeGraphContextEntityId();
    if (entityId) {
      selectEntity(entityId);
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

  els.menuShowRelated.addEventListener('click', (event) => {
    event.stopPropagation();
  });
  els.menuShowRelated.addEventListener('change', () => {
    updateMenuRelatedFilterVisibility();
    applyContextMenuRelatedOptions();
  });
  els.menuRelatedTimePeriod.addEventListener('change', applyContextMenuRelatedOptions);
  els.menuRelatedDistance.addEventListener('change', applyContextMenuRelatedOptions);
  els.menuRelatedRow?.addEventListener('mousedown', (event) => event.stopPropagation());
  els.menuRelatedFiltersFlyout?.addEventListener('mousedown', (event) => event.stopPropagation());
  els.menuRelatedFiltersFlyout?.addEventListener('click', (event) => event.stopPropagation());
  els.menuRelatedFiltersFlyout?.addEventListener('wheel', (event) => event.stopPropagation(), {
    passive: true,
  });
  els.mapContextRelatedSection?.addEventListener('mousedown', (event) => event.stopPropagation());
  els.mapContextRelatedSection?.addEventListener('click', (event) => event.stopPropagation());

  els.graphMenuShowRelated.addEventListener('click', (event) => {
    event.stopPropagation();
  });
  els.graphMenuShowRelated.addEventListener('change', () => {
    updateGraphMenuRelatedFilterVisibility();
    applyGraphContextMenuRelatedOptions();
  });
  els.graphMenuRelatedTimePeriod.addEventListener('change', applyGraphContextMenuRelatedOptions);
  els.graphMenuRelatedRow?.addEventListener('mousedown', (event) => event.stopPropagation());
  els.graphMenuRelatedFiltersFlyout?.addEventListener('mousedown', (event) => event.stopPropagation());
  els.graphMenuRelatedFiltersFlyout?.addEventListener('click', (event) => event.stopPropagation());
  els.graphMenuRelatedFiltersFlyout?.addEventListener('wheel', (event) => event.stopPropagation(), {
    passive: true,
  });
  els.graphContextRelatedSection?.addEventListener('mousedown', (event) => event.stopPropagation());
  els.graphContextRelatedSection?.addEventListener('click', (event) => event.stopPropagation());

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
    const linkLabel = event.target.closest('.graph-link__label');
    if (linkLabel) {
      showGraphLinkLabelTooltip(linkLabel, event.clientX, event.clientY);
      return;
    }

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
    const linkLabel = event.target.closest('.graph-link__label');
    if (linkLabel) {
      if (event.relatedTarget && linkLabel.contains(event.relatedTarget)) {
        return;
      }
      hideGraphNodeTooltip();
      return;
    }

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
      graphInteraction.dragNodeIds = getGraphDragNodeIds(graphInteraction.nodeId);
      graphInteraction.dragStartPositions = captureGraphDragStartPositions(graphInteraction.dragNodeIds);
      els.graphSvg.classList.add('graph-svg--dragging-node');
      event.preventDefault();
      return;
    }

    if (event.shiftKey) {
      graphInteraction.mode = 'boxSelect';
      graphInteraction.boxSelectStart = { x: event.clientX, y: event.clientY };
      els.graphSvg.classList.add('graph-svg--box-select');
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

    if (graphInteraction.mode === 'boxSelect' && graphInteraction.boxSelectStart) {
      updateGraphBoxSelectOverlay(graphInteraction.boxSelectStart, {
        x: event.clientX,
        y: event.clientY,
      });
      return;
    }

    if (graphInteraction.mode === 'node' && graphInteraction.nodeId && graphInteraction.nodeOffset) {
      const point = clientToGraphPoint(event.clientX, event.clientY);
      moveGraphDragNodes(graphInteraction.nodeId, point);
      graphInteraction.dragMoved = true;
      syncGraphDomPositions();
    }
  });

  window.addEventListener('mouseup', (event) => {
    if (graphInteraction.mode === 'boxSelect' && graphInteraction.boxSelectStart) {
      finishGraphBoxSelection(graphInteraction.boxSelectStart, {
        x: event.clientX,
        y: event.clientY,
      });
      endGraphInteraction();
      return;
    }

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
  els.btnMapZoomIn?.addEventListener('click', () => zoomMap(1));
  els.btnMapZoomOut?.addEventListener('click', () => zoomMap(-1));

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
    onDropdownFocus: () => {
      state.vizSearchSessionOpen = true;
    },
  });

  function buildAreaSuggestions(partial) {
    const normalized = String(partial || '').trim();
    const local = MapLocations.searchGeographicAreas(normalized, lookup, 15);
    const defaults = PlaceSearch.getDefaultAreaSuggestions(normalized);
    const cached = normalized ? PlaceSearch.getCached(normalized) : [];
    const remote = state.areaSuggestionResults || [];

    return PlaceSearch.mergeAreas(
      [...defaults, ...local],
      [...remote, ...cached],
      normalized,
      15
    ).map((area) => ({
      kind: 'item',
      id: `area-${area.id}`,
      label: area.label,
      description: area.displayName || area.placeType || 'Geographic area',
      insert: `area:${area.label}`,
      apply: { kind: 'area', term: area.label, displayName: area.displayName, area },
    }));
  }

  const sharedSmartSearchOptions = {
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
    getRoleCatalog: () => roleCatalog,
    onChange: handleSmartSearchChange,
    onGeographicInputClear: clearMapGeographicHighlightOnInput,
    onSearchQueryChange: schedulePlaceSearchFromInput,
    onAreaSuggestionSearch: scheduleAreaSuggestionSearch,
    onApplyArea: handleApplyArea,
    getLookup: () => lookup,
    resolveAreaTerm: resolveAreaFromTerm,
    onSubmit: () => {
      if (isMapGeographicSearchEnabled()) {
        submitMapGeographicSearch();
      }
    },
  };

  SmartSearchBar.init({
    root: document.getElementById('global-smart-search'),
    input: els.search,
    pillsEl: document.getElementById('global-search-pills'),
    menuEl: document.getElementById('global-search-menu'),
    ...sharedSmartSearchOptions,
    isGeographicSearchEnabled: () => false,
  });

  SmartSearchBar.init({
    root: document.getElementById('viz-smart-search'),
    input: els.vizSearchInput,
    pillsEl: document.getElementById('viz-search-pills'),
    menuEl: document.getElementById('viz-search-menu'),
    ...sharedSmartSearchOptions,
    isGeographicSearchEnabled: isMapGeographicSearchEnabled,
    getAreaSuggestions: buildAreaSuggestions,
  });

  renderObjectTypeNav();
  initRelatedTypeFilters();
    mountContextMenus();
    window.addEventListener('resize', refreshOpenContextMenuPosition);
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
      switchAsset('object-explorer');
      selectEntity(entity.id);
      switchView('search');
    },
  });
  initAssetNavigation();
  syncWorkbenchTabs();
  void (async () => {
    if (new URLSearchParams(window.location.search).has('area')) {
      await loadGeographicAreaFromUrl();
      return;
    }
    switchAsset('object-explorer');
    switchView('search');
  })();
})();
