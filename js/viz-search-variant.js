(function () {
  const VARIANTS = {
    modal: {
      label: 'Modal (current)',
      persistent: false,
      explicitOpen: true,
      description: 'Full-screen dialog; closes after each add.',
    },
    strip: {
      label: 'Expandable strip',
      persistent: true,
      explicitOpen: false,
      description: 'Search bar + results drop down from the top chrome.',
    },
    dock: {
      label: 'Side dock',
      persistent: true,
      explicitOpen: false,
      description: 'Dedicated left panel for search and results.',
    },
    drawer: {
      label: 'Bottom drawer',
      persistent: true,
      explicitOpen: true,
      description: 'Results slide up from the bottom; search stays on top.',
    },
    split: {
      label: 'Split view',
      persistent: true,
      explicitOpen: false,
      description: 'Search list and canvas side by side.',
    },
    spotlight: {
      label: 'Spotlight palette',
      persistent: true,
      explicitOpen: true,
      description: 'Lightweight centered palette without dimming the canvas.',
    },
  };

  let current = 'modal';
  let shell = null;
  let hosts = { map: null, graph: null };
  let frames = { map: null, graph: null };
  let chrome = { map: null, graph: null };
  let toastTimer = null;
  let onDoneCallback = null;
  let focusInputCallback = null;

  function get() {
    return current;
  }

  function getMeta() {
    return VARIANTS[current] || VARIANTS.modal;
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

  function readVariantFromUrl() {
    const params = new URLSearchParams(window.location.search);
    const value = (params.get('variant') || 'modal').toLowerCase();
    return VARIANTS[value] ? value : 'modal';
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
    const meta = getMeta();
    banner.classList.toggle('hidden', isModal());
    const label = banner.querySelector('[data-variant-label]');
    if (label) {
      label.textContent = meta.label;
    }
  }

  function setShellOpen(open) {
    if (!shell) {
      return;
    }
    shell.classList.toggle('viz-add-shell--open', open);
    shell.classList.toggle('viz-add-shell--closed', !open);
  }

  function updateChromeTriggers(context) {
    const active = context || null;
    for (const key of ['map', 'graph']) {
      const bar = chrome[key];
      if (!bar) {
        continue;
      }
      const trigger = bar.querySelector('.viz-search-trigger');
      if (!trigger) {
        continue;
      }
      const hideTrigger = !isModal() && (current === 'strip' || current === 'split' || current === 'dock');
      trigger.classList.toggle('hidden', hideTrigger);
    }
  }

  function mountTo(context) {
    if (!shell || !hosts[context]) {
      return;
    }

    const host = hosts[context];
    const frame = frames[context];
    const title = document.getElementById('viz-search-modal-title');
    if (title) {
      title.textContent = contextTitle(context);
    }

    shell.dataset.context = context;
    shell.className = `viz-add-shell viz-add-shell--${current}`;
    host.appendChild(shell);

    if (frame) {
      frame.classList.remove(
        'map-frame--viz-strip',
        'map-frame--viz-dock',
        'map-frame--viz-drawer',
        'map-frame--viz-split',
        'map-frame--viz-spotlight',
        'graph-frame--viz-strip',
        'graph-frame--viz-dock',
        'graph-frame--viz-drawer',
        'graph-frame--viz-split',
        'graph-frame--viz-spotlight'
      );
      const prefix = frame.classList.contains('map-frame') ? 'map-frame' : 'graph-frame';
      if (!isModal()) {
        frame.classList.add(`${prefix}--viz-${current}`);
      }
    }

    updateChromeTriggers(context);
    const collapseBtn = document.getElementById('btn-viz-search-collapse');
    if (collapseBtn) {
      collapseBtn.classList.toggle('hidden', current !== 'strip');
    }

    if (isModal()) {
      setShellOpen(true);
      return;
    }

    if (needsExplicitOpen()) {
      return;
    }

    setShellOpen(true);
  }

  function updateOpenState(sessionOpen) {
    if (isModal()) {
      return;
    }
    setShellOpen(sessionOpen);
    const footer = shell?.querySelector('[data-persistent-only]');
    if (footer) {
      footer.classList.toggle('hidden', !sessionOpen || current === 'strip' || current === 'split');
    }
  }

  function init(options = {}) {
    current = readVariantFromUrl();
    document.documentElement.dataset.vizVariant = current;
    onDoneCallback = options.onDone || null;
    focusInputCallback = options.focusInput || null;

    shell = document.getElementById('viz-add-shell');
    hosts.map = document.getElementById('viz-search-host-map');
    hosts.graph = document.getElementById('viz-search-host-graph');
    frames.map = document.getElementById('map-frame');
    frames.graph = document.getElementById('graph-frame');
    chrome.map = document.querySelector('#view-map .viz-chrome');
    chrome.graph = document.querySelector('#view-graph .viz-chrome');

    const modal = document.getElementById('viz-search-modal');
    const modalHeader = shell?.querySelector('[data-modal-only]');
    const persistentFooter = shell?.querySelector('[data-persistent-only]');
    const doneButton = document.getElementById('btn-viz-search-done');

    if (isModal()) {
      document.body.classList.add('viz-variant-modal');
      if (persistentFooter) {
        persistentFooter.classList.add('hidden');
      }
    } else {
      document.body.classList.add('viz-variant-alt');
      if (modal) {
        modal.classList.add('viz-search-modal--disabled');
      }
      if (modalHeader) {
        modalHeader.classList.add('hidden');
      }
      if (persistentFooter) {
        persistentFooter.classList.remove('hidden');
      }
      if (shell && modal?.querySelector('.viz-search-modal__panel')) {
        // Shell is moved out of modal on first mount.
      }
    }

    doneButton?.addEventListener('click', () => {
      onDoneCallback?.({ clearSearch: false });
    });

    const collapseStrip = document.getElementById('btn-viz-search-collapse');
    collapseStrip?.addEventListener('click', () => {
      if (current === 'strip') {
        const open = shell?.classList.contains('viz-add-shell--closed');
        setShellOpen(open);
        if (open) {
          focusInputCallback?.();
        }
      }
    });

    updateBanner();
    return current;
  }

  window.VizSearchVariant = {
    VARIANTS,
    get,
    getMeta,
    isModal,
    isPersistent,
    needsExplicitOpen,
    init,
    mountTo,
    updateOpenState,
    setShellOpen,
    showToast,
    contextTitle,
    readVariantFromUrl,
  };
})();
