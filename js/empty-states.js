(function () {
  const icons = {
    search: `<svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>`,
    filter: `<svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><path d="M4 6h16M7 12h10M10 18h4"/></svg>`,
    graph: `<svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><circle cx="6" cy="18" r="2.5"/><circle cx="18" cy="6" r="2.5"/><circle cx="18" cy="18" r="2.5"/><path d="M8.2 16.4 15.8 7.6M8.2 16.4l9.5 1.1M15.8 7.6 7.3 15.5"/></svg>`,
    map: `<svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><path d="M9 4l-5 2v14l5-2 6 2 5-2V4l-5 2-6-2z"/><path d="M9 4v14M15 6v14"/></svg>`,
    none: `<svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="8"/><path d="M9.5 9.5l5 5M14.5 9.5l-5 5"/></svg>`,
  };

  const templates = {
    'search-idle': {
      icon: 'search',
      tone: 'accent',
      title: 'Start the investigation',
      message: 'Look up people, organisations, locations, and case objects in one place.',
      tips: [
        'Type a name, place, or keyword to start',
        'Add filters with <code>type:Person</code> or <code>BRANCHE = value</code>',
        'Scope a field with <code>in:</code> then pick an attribute',
      ],
    },
    'search-no-results': {
      icon: 'none',
      tone: 'muted',
      title: 'Nothing matched',
      message: 'No objects fit your search and filters right now.',
      tips: [
        'Check spelling or try a shorter keyword',
        'Remove a filter pill to broaden results',
        'Search across more object types with <code>type:</code>',
      ],
    },
    'search-viz': {
      icon: 'search',
      tone: 'accent',
      title: 'Start the investigation',
      message: 'Look up people, organisations, locations, and case objects in one place.',
      tips: [
        'Type a name, place, or keyword to start',
        'Add filters with <code>type:Person</code> or <code>BRANCHE = value</code>',
        'Scope a field with <code>in:</code> then pick an attribute',
      ],
    },
    'graph-empty': {
      icon: 'graph',
      tone: 'accent',
      title: 'Start building the graph',
      message: 'Explore connections by adding objects from search.',
      tips: [
        'Open search with <kbd>⌘</kbd><kbd>/</kbd>',
        'Pick results to add nodes and expand relationships',
      ],
      compact: true,
    },
    'map-empty': {
      icon: 'map',
      tone: 'accent',
      title: 'No locations pinned yet',
      message: 'Search for objects with addresses or coordinates, then pin them here.',
      tips: [
        'Open search with <kbd>⌘</kbd><kbd>/</kbd>',
        'Select a result to drop it on the map',
      ],
      compact: true,
    },
  };

  function renderTips(tips) {
    if (!tips?.length) {
      return '';
    }
    return `<ul class="empty-state__tips">${tips.map((tip) => `<li>${tip}</li>`).join('')}</ul>`;
  }

  function render(variant, options = {}) {
    const base = templates[variant] || templates['search-idle'];
    const title = options.title || base.title;
    const message = options.message !== undefined ? options.message : base.message;
    const tips = options.tips !== undefined ? options.tips : base.tips;
    const icon = icons[options.icon || base.icon] || icons.search;
    const tone = options.tone || base.tone || 'accent';
    const compact = options.compact ?? base.compact ?? false;

    const vizContext = options.context === 'map' ? 'map' : options.context === 'graph' ? 'graph' : null;
    let resolvedMessage = message;
    let resolvedTips = tips;

    if (variant === 'search-viz' && vizContext === 'map') {
      resolvedMessage = 'Look up people, organisations, locations, and case objects to pin on the map.';
      resolvedTips = [
        'Type a name, place, or keyword to start',
        'Add filters with <code>type:Person</code> or <code>BRANCHE = value</code>',
        'Scope a field with <code>in:</code> then pick an attribute',
        'Select a result to drop it on the map',
      ];
    } else if (variant === 'search-viz' && vizContext === 'graph') {
      resolvedMessage = 'Look up people, organisations, locations, and case objects to add to the graph.';
      resolvedTips = [
        'Type a name, place, or keyword to start',
        'Add filters with <code>type:Person</code> or <code>BRANCHE = value</code>',
        'Scope a field with <code>in:</code> then pick an attribute',
        'Select a result to create a node and expand relationships',
      ];
    } else if (variant === 'search-viz' && !vizContext) {
      resolvedMessage = 'Look up people, organisations, locations, and case objects in one place.';
      resolvedTips = [
        'Type a name, place, or keyword to start',
        'Add filters with <code>type:Person</code> or <code>BRANCHE = value</code>',
        'Scope a field with <code>in:</code> then pick an attribute',
      ];
    }

    const messageHtml = resolvedMessage
      ? `<p class="empty-state__message">${resolvedMessage}</p>`
      : '';

    return `
      <div class="empty-state${compact ? ' empty-state--compact' : ''}" data-variant="${variant}">
        <div class="empty-state__visual empty-state__visual--${tone}">${icon}</div>
        <h3 class="empty-state__title">${title}</h3>
        ${messageHtml}
        ${renderTips(resolvedTips)}
      </div>
    `;
  }

  window.EmptyStates = {
    render,
  };
})();
