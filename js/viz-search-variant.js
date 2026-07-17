(function () {
  const VARIANTS = {
    modal: {
      label: 'Modal (original)',
      persistent: false,
      explicitOpen: true,
      description: 'The original full-screen dialog; closes after each add.',
    },
    strip: {
      label: 'Expandable strip',
      persistent: true,
      explicitOpen: false,
      mountOnView: true,
      startResultsCollapsed: true,
      description: 'Search bar always visible; click to expand results over the map.',
    },
    dock: {
      label: 'Side dock',
      persistent: true,
      explicitOpen: false,
      mountOnView: true,
      dockCollapsible: true,
      startDockCollapsed: true,
      description: 'Left panel for search; collapse when you need more canvas space.',
    },
    dropdown: {
      label: 'Floating dropdown',
      persistent: true,
      explicitOpen: true,
      description: 'Search button in the corner; opens a floating panel over the map.',
    },
  };

  let current = 'dropdown';
  let shell = null;
  let hosts = { map: null, graph: null };
  let frames = { map: null, graph: null };
  let chrome = { map: null, graph: null };
  let toastTimer = null;
  let onResultsChangeCallback = null;
  let focusInputCallback = null;
  let onClearSearchCallback = null;
  let onDropdownFocusCallback = null;
  let resultsExpanded = false;
  let dockCollapsed = false;
  let dropdownHostResizeObserver = null;
  let dropdownHostWindowResizeHandler = null;

  function get() {
    return current;
  }

  function getMeta() {
    return VARIANTS[current] || VARIANTS.dropdown;
  }

  function isModal() {
    return current === 'modal';
  }

  function isPersistent() {
    return getMeta().persistent;
  }

  function needsExplicitOpen() {
    return getMeta().explicitOpen;
  }

  function mountsOnView() {
    return getMeta().mountOnView === true;
  }

  function isResultsExpanded() {
    if (current === 'strip') {
      return resultsExpanded;
    }
    if (needsExplicitOpen()) {
      return shell && !shell.classList.contains('viz-add-shell--closed');
    }
    if (current === 'dock') {
      return !dockCollapsed;
    }
    return true;
  }

  function isDockCollapsed() {
    return current === 'dock' && dockCollapsed;
  }

  function readVariantFromUrl() {
    const params = new URLSearchParams(window.location.search);
    const value = (params.get('variant') || 'dropdown').toLowerCase();
    return VARIANTS[value] ? value : 'dropdown';
  }

  function contextTitle(context) {
    return context === 'map' ? 'Add to map' : 'Add to graph';
  }

  function showToast(message) {
    let toast = document.getElementById('viz-add-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'viz-add-toast';
      toast.className = 'viz-add-toast';
      toast.setAttribute('role', 'status');
      toast.setAttribute('aria-live', 'polite');
      document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.classList.add('viz-add-toast--visible');
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => {
      toast.classList.remove('viz-add-toast--visible');
    }, 2200);
  }

  function updateBanner() {
    const banner = document.getElementById('variant-banner');
    if (!banner) {
      return;
    }
    banner.classList.toggle('hidden', current === 'dropdown');
    const label = banner.querySelector('[data-variant-label]');
    if (label) {
      label.textContent = getMeta().label;
    }
  }

  function updateVariantControls() {
    const collapseBtn = document.getElementById('btn-viz-search-collapse');
    const closeResultsBtn = document.getElementById('btn-viz-search-close-results');
    const dockHeader = shell?.querySelector('[data-dock-only]');
    const dockToggle = document.getElementById('btn-viz-dock-toggle');

    collapseBtn?.classList.toggle('hidden', current !== 'strip');
    closeResultsBtn?.classList.toggle('hidden', current !== 'strip');
    document.querySelector('.viz-strip-actions')?.classList.toggle('hidden', current !== 'strip');
    dockHeader?.classList.toggle('hidden', current !== 'dock' || dockCollapsed);
    dockToggle?.classList.toggle('hidden', current !== 'dock' || !dockCollapsed);
  }

  function updateStripResultsVisibility(open) {
    if (current !== 'strip' || !shell) {
      return;
    }
    const panel = document.getElementById('viz-strip-results-panel');
    const results = document.getElementById('viz-search-results');
    panel?.classList.toggle('hidden', !open);
    panel?.setAttribute('aria-hidden', open ? 'false' : 'true');
    if (panel) {
      panel.hidden = !open;
    }
    results?.classList.toggle('hidden', !open);
    results?.setAttribute('aria-hidden', open ? 'false' : 'true');
  }

  function layoutStripHost(host) {
    if (!host || !shell) {
      return;
    }
    const panel = document.getElementById('viz-strip-results-panel');
    host.appendChild(shell);
    if (panel) {
      host.appendChild(panel);
    }
  }

  function layoutDefaultHost(host) {
    if (!host || !shell) {
      return;
    }
    const panel = document.getElementById('viz-strip-results-panel');
    if (panel && !shell.contains(panel)) {
      shell.appendChild(panel);
    }
    host.appendChild(shell);
  }

  function setShellOpen(open) {
    if (!shell) {
      return;
    }
    shell.classList.toggle('viz-add-shell--open', open);
    shell.classList.toggle('viz-add-shell--closed', !open);
    if (current === 'strip') {
      resultsExpanded = open;
      const ctx = shell.dataset.context;
      const host = hosts[ctx];
      host?.classList.toggle('viz-search-host--strip-expanded', open);
      shell.setAttribute('aria-expanded', open ? 'true' : 'false');
      updateStripResultsVisibility(open);
      const collapseBtn = document.getElementById('btn-viz-search-collapse');
      const closeResultsBtn = document.getElementById('btn-viz-search-close-results');
      if (collapseBtn) {
        collapseBtn.textContent = open ? '▴' : '▾';
        collapseBtn.setAttribute('aria-label', open ? 'Collapse results' : 'Expand results');
        collapseBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
      }
      if (closeResultsBtn) {
        closeResultsBtn.setAttribute('aria-label', open ? 'Close results' : 'Clear search');
        closeResultsBtn.setAttribute('title', open ? 'Close results' : 'Clear search');
      }
      if (!open) {
        document.getElementById('viz-search-input')?.blur();
      }
    }
    updateVariantControls();
    onResultsChangeCallback?.();
    if (current === 'dropdown') {
      updateChromeTriggers();
    }
  }

  function setResultsExpanded(open) {
    if (current === 'strip') {
      setShellOpen(open);
      return;
    }
    setShellOpen(open);
  }

  function setDockCollapsed(collapsed) {
    if (current !== 'dock') {
      return;
    }
    dockCollapsed = collapsed;
    hosts.map?.classList.toggle('viz-search-host--collapsed', collapsed);
    hosts.graph?.classList.toggle('viz-search-host--collapsed', collapsed);
    if (shell) {
      shell.classList.toggle('hidden', collapsed);
    }
    const dockToggle = document.getElementById('btn-viz-dock-toggle');
    dockToggle?.classList.toggle('hidden', !collapsed);
    updateVariantControls();
    onResultsChangeCallback?.();
  }

  function updateChromeTriggers() {
    for (const key of ['map', 'graph']) {
      const bar = chrome[key];
      if (!bar) {
        continue;
      }
      const trigger = bar.querySelector('.viz-search-trigger');
      if (!trigger) {
        continue;
      }
      const hideTrigger = !isModal() && (current === 'strip' || current === 'dock');
      trigger.classList.toggle('hidden', hideTrigger);
      if (current === 'dropdown') {
        const isActiveContext = shell?.dataset.context === key;
        const chromeSlot = document.getElementById(`viz-chrome-search-${key}`);
        trigger.classList.toggle('hidden', isActiveContext);
        chromeSlot?.classList.toggle('hidden', !isActiveContext);
        const isOpen =
          isActiveContext && !shell.classList.contains('viz-add-shell--closed');
        chromeSlot?.classList.toggle('viz-chrome-search--open', isOpen);
        trigger.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
      }
    }
  }

  function syncDropdownHostPosition(context) {
    if (current !== 'dropdown') {
      return;
    }

    const ctx = context || shell?.dataset.context;
    if (!ctx) {
      return;
    }

    const frame = frames[ctx];
    const host = hosts[ctx];
    const chromeSlot = document.getElementById(`viz-chrome-search-${ctx}`);
    if (!frame || !host || !chromeSlot || chromeSlot.classList.contains('hidden')) {
      return;
    }

    const frameRect = frame.getBoundingClientRect();
    const searchRect = chromeSlot.getBoundingClientRect();
    const top = Math.max(0, Math.round(searchRect.bottom - frameRect.top + 6));
    host.style.setProperty('--viz-dropdown-host-top', `${top}px`);
  }

  function detachDropdownHostSync() {
    dropdownHostResizeObserver?.disconnect();
    dropdownHostResizeObserver = null;
    if (dropdownHostWindowResizeHandler) {
      window.removeEventListener('resize', dropdownHostWindowResizeHandler);
      dropdownHostWindowResizeHandler = null;
    }
  }

  function attachDropdownHostSync() {
    if (current !== 'dropdown') {
      detachDropdownHostSync();
      return;
    }

    detachDropdownHostSync();

    const smartSearch = document.getElementById('viz-smart-search');
    const pills = document.getElementById('viz-search-pills');
    const surface = smartSearch?.querySelector('.smart-search__surface');
    const targets = [chromeSlotForContext(shell?.dataset.context), smartSearch, surface, pills].filter(
      Boolean
    );

    dropdownHostResizeObserver = new ResizeObserver(() => {
      syncDropdownHostPosition();
    });

    for (const target of targets) {
      dropdownHostResizeObserver.observe(target);
    }

    dropdownHostWindowResizeHandler = () => syncDropdownHostPosition();
    window.addEventListener('resize', dropdownHostWindowResizeHandler);
    requestAnimationFrame(() => syncDropdownHostPosition());
  }

  function chromeSlotForContext(context) {
    if (!context) {
      return null;
    }
    return document.getElementById(`viz-chrome-search-${context}`);
  }

  function layoutDropdownChrome(context) {
    const bar = chrome[context];
    const slot = document.getElementById(`viz-chrome-search-${context}`);
    const smartSearch = document.getElementById('viz-smart-search');
    const toolbar = document.getElementById('viz-search-toolbar');

    if (!bar || !slot || !smartSearch) {
      return;
    }

    slot.appendChild(smartSearch);
    slot.classList.remove('hidden');

    for (const key of ['map', 'graph']) {
      const trigger = chrome[key]?.querySelector('.viz-search-trigger');
      const chromeSlot = document.getElementById(`viz-chrome-search-${key}`);
      const isActive = key === context;
      trigger?.classList.toggle('hidden', isActive);
      chromeSlot?.classList.toggle('hidden', !isActive);
    }

    const input = document.getElementById('viz-search-input');
    if (input) {
      input.placeholder =
        context === 'map' ? 'Search objects to add to map…' : 'Search objects to add to graph…';
    }

    if (toolbar) {
      toolbar.classList.add('viz-add-shell__search--dropdown-chrome');
    }

    attachDropdownHostSync();
    syncDropdownHostPosition(context);
  }

  function restoreSearchToolbarFromChrome() {
    const smartSearch = document.getElementById('viz-smart-search');
    const toolbar = document.getElementById('viz-search-toolbar');
    if (smartSearch && toolbar && !toolbar.contains(smartSearch)) {
      toolbar.insertBefore(smartSearch, toolbar.firstChild);
    }
    toolbar?.classList.remove('viz-add-shell__search--dropdown-chrome');

    for (const key of ['map', 'graph']) {
      chrome[key]?.querySelector('.viz-search-trigger')?.classList.remove('hidden');
      document.getElementById(`viz-chrome-search-${key}`)?.classList.add('hidden');
    }

    const input = document.getElementById('viz-search-input');
    if (input) {
      input.placeholder = 'Search…';
    }
  }

  function mountTo(context) {
    if (!shell || !hosts[context]) {
      return;
    }

    const host = hosts[context];
    const frame = frames[context];
    const title = document.getElementById('viz-search-modal-title');
    const dockTitle = shell.querySelector('[data-dock-title]');
    if (title) {
      title.textContent = contextTitle(context);
    }
    if (dockTitle) {
      dockTitle.textContent = contextTitle(context);
    }

    shell.dataset.context = context;
    shell.dataset.title = contextTitle(context);
    shell.classList.remove(
      'viz-add-shell--modal',
      'viz-add-shell--strip',
      'viz-add-shell--dock',
      'viz-add-shell--dropdown'
    );
    shell.classList.add(`viz-add-shell--${current}`);

    if (current === 'dropdown') {
      const body = frame?.querySelector('.map-frame__body, .graph-frame__body');
      if (body && host.parentElement !== body) {
        body.insertBefore(host, body.firstChild);
      }
      layoutDropdownChrome(context);
    } else {
      restoreSearchToolbarFromChrome();
    }

    if (current === 'strip') {
      layoutStripHost(host);
    } else {
      layoutDefaultHost(host);
    }

    if (current === 'dock') {
      const dockToggle = document.getElementById('btn-viz-dock-toggle');
      if (dockToggle && dockToggle.parentElement !== host) {
        host.insertBefore(dockToggle, host.firstChild);
      }
    }

    if (frame) {
      frame.classList.remove(
        'map-frame--viz-strip',
        'map-frame--viz-dock',
        'map-frame--viz-dropdown',
        'graph-frame--viz-strip',
        'graph-frame--viz-dock',
        'graph-frame--viz-dropdown'
      );
      const prefix = frame.classList.contains('map-frame') ? 'map-frame' : 'graph-frame';
      if (!isModal()) {
        frame.classList.add(`${prefix}--viz-${current}`);
      }
    }

    updateChromeTriggers();
    updateVariantControls();

    if (isModal()) {
      setShellOpen(true);
      return;
    }

    if (current === 'strip') {
      setShellOpen(false);
      return;
    }

    if (current === 'dock') {
      setDockCollapsed(dockCollapsed);
      setShellOpen(!dockCollapsed);
      return;
    }

    if (needsExplicitOpen()) {
      setShellOpen(false);
      return;
    }

    setShellOpen(true);
  }

  function updateOpenState(sessionOpen, context) {
    if (isModal()) {
      return;
    }

    if (current === 'dropdown') {
      setShellOpen(sessionOpen);
      const ctx = context || shell?.dataset.context;
      const host = hosts[ctx];
      if (host) {
        host.classList.toggle('viz-search-host--active', sessionOpen);
      }
      updateVariantControls();
      requestAnimationFrame(() => syncDropdownHostPosition(ctx));
      return;
    }

    if (current === 'strip') {
      return;
    }

    setShellOpen(sessionOpen);
  }

  function collapseActivePanel() {
    if (current === 'strip') {
      setResultsExpanded(false);
      return true;
    }
    if (current === 'dropdown') {
      updateOpenState(false, shell?.dataset.context);
      return true;
    }
    if (current === 'dock' && !dockCollapsed) {
      setDockCollapsed(true);
      return true;
    }
    return false;
  }

  function isVizSearchSurfaceTarget(target) {
    if (!target?.closest) {
      return false;
    }
    if (shell?.contains(target)) {
      return true;
    }
    if (target.closest('#viz-strip-results-panel')) {
      return true;
    }
    if (target.closest('.viz-chrome-search')) {
      return true;
    }
    if (target.closest('.viz-search-trigger')) {
      return true;
    }
    return false;
  }

  function attachVizResultsScrollGuard() {
    const panel = document.getElementById('viz-strip-results-panel');
    const results = document.getElementById('viz-search-results');
    const stopWheel = (event) => {
      event.stopPropagation();
    };
    panel?.addEventListener('wheel', stopWheel, { passive: true });
    results?.addEventListener('wheel', stopWheel, { passive: true });
    panel?.addEventListener('click', (event) => {
      event.stopPropagation();
    });
  }

  function init(options = {}) {
    current = readVariantFromUrl();
    document.documentElement.dataset.vizVariant = current;
    onResultsChangeCallback = options.onResultsChange || null;
    focusInputCallback = options.focusInput || null;
    onClearSearchCallback = options.onClearSearch || null;
    onDropdownFocusCallback = options.onDropdownFocus || null;

    shell = document.getElementById('viz-add-shell');
    hosts.map = document.getElementById('viz-search-host-map');
    hosts.graph = document.getElementById('viz-search-host-graph');
    frames.map = document.getElementById('map-frame');
    frames.graph = document.getElementById('graph-frame');
    chrome.map = document.querySelector('#view-map .viz-chrome');
    chrome.graph = document.querySelector('#view-graph .viz-chrome');

    dockCollapsed = getMeta().startDockCollapsed === true;
    resultsExpanded = false;

    const modal = document.getElementById('viz-search-modal');
    const modalHeader = shell?.querySelector('[data-modal-only]');

    if (isModal()) {
      document.body.classList.add('viz-variant-modal');
    } else {
      document.body.classList.add('viz-variant-alt');
      modal?.classList.add('viz-search-modal--disabled');
      modalHeader?.classList.add('hidden');
    }

    document.getElementById('btn-viz-search-collapse')?.addEventListener('mousedown', (event) => {
      event.preventDefault();
    });

    document.getElementById('btn-viz-search-collapse')?.addEventListener('click', (event) => {
      event.stopPropagation();
      if (current === 'strip') {
        setResultsExpanded(!resultsExpanded);
        if (resultsExpanded) {
          focusInputCallback?.();
        }
      }
    });

    document.getElementById('btn-viz-search-close-results')?.addEventListener('mousedown', (event) => {
      event.preventDefault();
    });

    document.getElementById('btn-viz-search-close-results')?.addEventListener('click', (event) => {
      event.stopPropagation();
      if (current !== 'strip') {
        return;
      }
      if (resultsExpanded) {
        setResultsExpanded(false);
      }
      onClearSearchCallback?.();
      document.getElementById('viz-search-input')?.blur();
    });

    document.getElementById('btn-viz-dock-collapse')?.addEventListener('click', (event) => {
      event.stopPropagation();
      if (current === 'dock') {
        setDockCollapsed(true);
      }
    });

    document.getElementById('btn-viz-dock-toggle')?.addEventListener('click', (event) => {
      event.stopPropagation();
      if (current === 'dock') {
        setDockCollapsed(false);
        focusInputCallback?.();
      }
    });

    shell?.querySelector('.viz-add-shell__search')?.addEventListener('click', (event) => {
      event.stopPropagation();
    });

    shell?.addEventListener('click', (event) => {
      event.stopPropagation();
    });

    document.addEventListener('click', (event) => {
      if (isVizSearchSurfaceTarget(event.target)) {
        return;
      }
      if (current === 'strip' && resultsExpanded) {
        setResultsExpanded(false);
      } else if (current === 'dropdown' && shell && !shell.classList.contains('viz-add-shell--closed')) {
        updateOpenState(false, shell.dataset.context);
      }
    });

    const vizInput = document.getElementById('viz-search-input');
    vizInput?.addEventListener('input', () => {
      if (current !== 'dropdown') {
        return;
      }
      const ctx = shell?.dataset.context;
      if (!ctx) {
        return;
      }
      if (SmartSearchBar.isFilterCommandInput(vizInput.value)) {
        updateOpenState(false, ctx);
        onDropdownFocusCallback?.();
        onResultsChangeCallback?.();
        return;
      }
      if (shell?.classList.contains('viz-add-shell--closed')) {
        updateOpenState(true, ctx);
        onDropdownFocusCallback?.();
        onResultsChangeCallback?.();
      }
    });

    vizInput?.addEventListener('focus', () => {
      if (current === 'strip' && !resultsExpanded) {
        setResultsExpanded(true);
        onResultsChangeCallback?.();
      }
      if (current === 'dock' && dockCollapsed) {
        setDockCollapsed(false);
        onResultsChangeCallback?.();
      }
      if (current === 'dropdown') {
        const ctx = shell?.dataset.context;
        if (ctx) {
          if (!SmartSearchBar.isFilterCommandInput(vizInput.value)) {
            updateOpenState(true, ctx);
          }
          onDropdownFocusCallback?.();
          onResultsChangeCallback?.();
        }
      }
    });

    updateBanner();
    updateVariantControls();

    attachVizResultsScrollGuard();
    if (current === 'dropdown') {
      attachDropdownHostSync();
    }

    if (!isModal()) {
      mountTo('map');
    }

    return current;
  }

  window.VizSearchVariant = {
    VARIANTS,
    get,
    getMeta,
    isModal,
    isPersistent,
    needsExplicitOpen,
    mountsOnView,
    isResultsExpanded,
    isDockCollapsed,
    init,
    mountTo,
    updateOpenState,
    setShellOpen,
    setResultsExpanded,
    setDockCollapsed,
    collapseActivePanel,
    showToast,
    contextTitle,
    readVariantFromUrl,
    syncDropdownHostPosition,
  };
})();
