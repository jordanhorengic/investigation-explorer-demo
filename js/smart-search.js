(function () {
  const instances = [];

  function normalizeText(value) {
    return String(value || '').trim();
  }

  function findType(objectTypes, token) {
    const needle = token.toLowerCase();
    return objectTypes.find(
      (type) => type.id.toLowerCase() === needle || type.technicalName?.toLowerCase() === needle
    );
  }

  function findField(catalog, selectedTypes, token) {
    const needle = token.toLowerCase();
    const fields = SearchFilters.getAvailableFields(catalog, selectedTypes);
    return (
      fields.find((fieldId) => fieldId.toLowerCase() === needle) ||
      fields.find((fieldId) => DisplayNames.formatFieldLabel(fieldId).toLowerCase() === needle)
    );
  }

  function isSchemaFieldName(token) {
    return /^[A-Z][A-Z0-9_]*$/.test(String(token || '').trim());
  }

  function resolveFieldId(catalog, selectedTypes, token) {
    const normalized = String(token || '').trim();
    if (!normalized) {
      return null;
    }

    const known = findField(catalog, selectedTypes, normalized);
    if (known) {
      return known;
    }

    for (const fieldId of catalog.allFields.keys()) {
      if (fieldId.toLowerCase() === normalized.toLowerCase()) {
        return fieldId;
      }
    }

    if (isSchemaFieldName(normalized)) {
      return normalized;
    }

    return null;
  }

  function isFilterCommandInput(value) {
    const trimmed = normalizeText(value);
    if (!trimmed) {
      return false;
    }

    if (/^type(?::|$)/i.test(trimmed)) {
      return true;
    }

    if (/^in$/i.test(trimmed) || /^in:/i.test(trimmed)) {
      return true;
    }

    if (/^area(?::|$)/i.test(trimmed)) {
      return true;
    }

    return (
      /^[A-Z][A-Z0-9_]*\s+(contains|equals|=|is:set|exists)(\s|$)/i.test(trimmed) ||
      /^[A-Z][A-Z0-9_]*\s*:\s*\S/.test(trimmed)
    );
  }

  function buildInFieldSuggestions(catalog, objectTypes, filters, partial = '') {
    const entries = [];
    const needle = String(partial || '').trim().toLowerCase();
    const restricted = SearchFilters.isRestrictedTypes(filters, objectTypes.length);
    const typesToShow = restricted
      ? objectTypes.filter((type) => filters.types.has(type.id))
      : objectTypes;

    for (const type of typesToShow) {
      const fieldIds = [...(catalog.byType.get(type.id) || [])].sort((a, b) => a.localeCompare(b));
      const matches = fieldIds.filter((fieldId) => {
        if (!needle) {
          return true;
        }
        const label = DisplayNames.formatFieldLabel(fieldId).toLowerCase();
        return fieldId.toLowerCase().includes(needle) || label.includes(needle);
      });

      if (matches.length === 0) {
        continue;
      }

      entries.push({
        kind: 'section',
        id: `section-${type.id}`,
        label: type.id,
        typeId: type.id,
        count: matches.length,
      });

      for (const fieldId of matches) {
        entries.push({
          kind: 'item',
          id: `in-${type.id}-${fieldId}`,
          label: DisplayNames.formatFieldLabel(fieldId),
          description: fieldId,
          insert: `in:${fieldId}`,
          apply: { kind: 'field', fieldId },
        });
      }
    }

    return entries;
  }

  function flattenSelectableItems(entries) {
    return entries.filter((entry) => entry.kind === 'item');
  }

  function buildPillDescriptors(filters, objectTypes) {
    const pills = [];
    const totalTypes = objectTypes.length;

    if (SearchFilters.isRestrictedTypes(filters, totalTypes)) {
      for (const typeId of [...filters.types].sort((a, b) => a.localeCompare(b))) {
        pills.push({
          id: `type:${typeId}`,
          kind: 'type',
          typeId,
          label: typeId,
          prefix: 'type',
        });
      }
    }

    if (filters.searchFields?.size) {
      for (const fieldId of [...filters.searchFields].sort((a, b) => a.localeCompare(b))) {
        pills.push({
          id: `in:${fieldId}`,
          kind: 'field',
          fieldId,
          label: DisplayNames.formatFieldLabel(fieldId),
          prefix: 'in',
        });
      }
    }

    for (const rule of filters.attributeRules) {
      pills.push({
        id: rule.id,
        kind: 'attr',
        ruleId: rule.id,
        label: SearchFilters.describeRule(rule),
        prefix: 'filter',
      });
    }

    if (filters.geographicArea) {
      pills.push({
        id: `area:${filters.geographicArea.id}`,
        kind: 'area',
        areaId: filters.geographicArea.id,
        label: filters.geographicArea.label,
        prefix: 'area',
      });
    }

    return pills;
  }

  function applyTypeCommand(typeId, filters, objectTypes) {
    const next = SearchFilters.clone(filters);
    const totalTypes = objectTypes.length;
    if (!SearchFilters.isRestrictedTypes(filters, totalTypes)) {
      next.types = new Set([typeId]);
    } else {
      next.types.add(typeId);
    }
    return next;
  }

  function applyFieldCommand(fieldId, filters, catalog) {
    const next = SearchFilters.clone(filters);
    if (!catalog.allFields.has(fieldId)) {
      return next;
    }
    if (!next.searchFields) {
      next.searchFields = new Set([fieldId]);
      return next;
    }
    next.searchFields.add(fieldId);
    const available = SearchFilters.getAvailableFields(catalog, next.types);
    if (available.length > 0 && next.searchFields.size >= available.length) {
      next.searchFields = null;
    }
    return next;
  }

  function applyAreaCommand(areaOrTerm, filters, lookup, resolveAreaTerm) {
    const next = SearchFilters.clone(filters);
    let area = null;

    if (areaOrTerm && typeof areaOrTerm === 'object' && areaOrTerm.bounds) {
      area = window.MapLocations?.cloneArea(areaOrTerm) || areaOrTerm;
    } else if (areaOrTerm && lookup) {
      area = window.MapLocations?.findGeographicArea(String(areaOrTerm), lookup) || null;
      if (!area && resolveAreaTerm) {
        area = resolveAreaTerm(String(areaOrTerm));
      }
      if (!area && window.PlaceSearch) {
        const cached = window.PlaceSearch.getCached(String(areaOrTerm).trim().toLowerCase());
        area =
          cached.find(
            (entry) => entry.label.toLowerCase() === String(areaOrTerm).trim().toLowerCase()
          ) ||
          cached[0] ||
          null;
      }
    }

    next.geographicArea = area;
    return next;
  }

  function applyAttrCommand(fieldId, operator, value, filters) {
    const next = SearchFilters.clone(filters);
    next.attributeRules.push({
      id: `rule-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      fieldId,
      operator,
      value: value || '',
    });
    return next;
  }

  function parseCommand(text, objectTypes, catalog, filters) {
    const trimmed = normalizeText(text);
    if (!trimmed) {
      return null;
    }

    const typeMatch = trimmed.match(/^type:(.+)$/i);
    if (typeMatch) {
      const type = findType(objectTypes, typeMatch[1].trim());
      if (type) {
        return { kind: 'type', typeId: type.id };
      }
      return null;
    }

    const inMatch = trimmed.match(/^in:(.+)$/i);
    if (inMatch) {
      const fieldId = resolveFieldId(catalog, filters.types, inMatch[1].trim());
      if (fieldId) {
        return { kind: 'field', fieldId };
      }
      return null;
    }

    const areaMatch = trimmed.match(/^area:(.+)$/i);
    if (areaMatch) {
      return { kind: 'area', term: areaMatch[1].trim() };
    }

    const attrColon = trimmed.match(/^([A-Z][A-Z0-9_]*)\s*:\s*(.+)$/);
    if (attrColon) {
      const fieldId = resolveFieldId(catalog, filters.types, attrColon[1]);
      if (fieldId) {
        return { kind: 'attr', fieldId, operator: 'contains', value: attrColon[2].trim() };
      }
    }

    const attrPhrase = trimmed.match(/^([A-Z][A-Z0-9_]*)\s+(contains|equals|=|is:set|exists)\s*(.*)$/i);
    if (attrPhrase) {
      const fieldId = resolveFieldId(catalog, filters.types, attrPhrase[1]);
      if (fieldId) {
        let operator = attrPhrase[2].toLowerCase();
        if (operator === '=') {
          operator = 'equals';
        }
        if (operator === 'exists') {
          operator = 'exists';
        }
        if (operator === 'is:set') {
          operator = 'exists';
        }
        return {
          kind: 'attr',
          fieldId,
          operator,
          value: attrPhrase[3]?.trim() || '',
        };
      }
    }

    return null;
  }

  function getSuggestions(
    input,
    objectTypes,
    catalog,
    filters,
    lookup = null,
    getAreaSuggestions = null,
    geographicEnabled = false
  ) {
    const value = input;
    const trimmed = value.trim();

    if (!trimmed || !isFilterCommandInput(trimmed)) {
      return [];
    }

    if (/^area(?::|$)/i.test(trimmed)) {
      if (!geographicEnabled) {
        return [];
      }
      const partial = trimmed.replace(/^area:?/i, '').trim();
      if (getAreaSuggestions) {
        return getAreaSuggestions(partial);
      }
      const areas = window.MapLocations?.searchGeographicAreas(partial, lookup, 12) || [];
      return areas.map((area) => ({
        kind: 'item',
        id: `area-${area.id}`,
        label: area.label,
        description: area.placeType || area.displayName || 'Geographic area',
        insert: `area:${area.label}`,
        apply: { kind: 'area', area },
      }));
    }

    if (/^type(?::|$)/i.test(trimmed)) {
      const partial = trimmed.replace(/^type:?/i, '').trim().toLowerCase();
      return objectTypes
        .filter((type) => !partial || type.id.toLowerCase().includes(partial))
        .map((type) => ({
          kind: 'item',
          id: `type-${type.id}`,
          label: type.id,
          description: 'Object type',
          insert: `type:${type.id}`,
          apply: { kind: 'type', typeId: type.id },
        }));
    }

    if (/^in$/i.test(trimmed) || /^in:/i.test(trimmed)) {
      const partial = trimmed.match(/^in:(.*)$/i)?.[1]?.trim() || '';
      return buildInFieldSuggestions(catalog, objectTypes, filters, partial);
    }

    const fields = SearchFilters.getAvailableFields(catalog, filters.types);
    const partial = trimmed.toLowerCase();

    const fieldNameMatch = trimmed.match(/^([A-Z][A-Z0-9_]*)$/);
    if (fieldNameMatch) {
      const resolved = resolveFieldId(catalog, filters.types, fieldNameMatch[1]);
      if (resolved) {
        const label = DisplayNames.formatFieldLabel(resolved);
        return [
          {
            kind: 'item',
            id: `attr-${resolved}-contains`,
            label: `${label} contains …`,
            description: resolved,
            insert: `${resolved} contains `,
          },
          {
            kind: 'item',
            id: `attr-${resolved}-equals`,
            label: `${label} = …`,
            description: 'Exact match',
            insert: `${resolved} = `,
          },
          {
            kind: 'item',
            id: `attr-${resolved}-exists`,
            label: `${label} is set`,
            description: 'Has any value',
            insert: `${resolved} is:set`,
            apply: { kind: 'attr', fieldId: resolved, operator: 'exists', value: '' },
          },
        ];
      }
    }

    if (!/^[A-Z][A-Z0-9_]*(\s|$)/.test(trimmed) && !/^in:/i.test(trimmed)) {
      return [];
    }

    const fieldMatches = fields
      .filter((fieldId) => {
        const label = DisplayNames.formatFieldLabel(fieldId).toLowerCase();
        return fieldId.toLowerCase().includes(partial) || label.includes(partial);
      })
      .slice(0, 6)
      .flatMap((fieldId) => [
        {
          kind: 'item',
          id: `attr-${fieldId}-contains`,
          label: `${DisplayNames.formatFieldLabel(fieldId)} contains …`,
          description: 'Attribute filter',
          insert: `${fieldId} contains `,
        },
        {
          kind: 'item',
          id: `attr-${fieldId}-equals`,
          label: `${DisplayNames.formatFieldLabel(fieldId)} = …`,
          description: 'Exact attribute match',
          insert: `${fieldId} = `,
        },
        {
          kind: 'item',
          id: `attr-${fieldId}-exists`,
          label: `${DisplayNames.formatFieldLabel(fieldId)} is set`,
          description: 'Attribute has any value',
          insert: `${fieldId} is:set`,
          apply: { kind: 'attr', fieldId, operator: 'exists', value: '' },
        },
      ]);

    return fieldMatches;
  }

  function removePill(kind, payload, filters, objectTypes) {
    const next = SearchFilters.clone(filters);
    const totalTypes = objectTypes.length;

    if (kind === 'type') {
      next.types.delete(payload.typeId);
      if (next.types.size === 0) {
        next.types = new Set(objectTypes.map((type) => type.id));
      }
    } else if (kind === 'field') {
      if (next.searchFields) {
        next.searchFields.delete(payload.fieldId);
        if (next.searchFields.size === 0) {
          next.searchFields = null;
        }
      }
    } else if (kind === 'attr') {
      next.attributeRules = next.attributeRules.filter((rule) => rule.id !== payload.ruleId);
    } else if (kind === 'area') {
      next.geographicArea = null;
    }

    return next;
  }

  function applyParsedCommand(command, filters, objectTypes, catalog, lookup = null, resolveAreaTerm = null) {
    if (!command) {
      return filters;
    }
    if (command.kind === 'type') {
      return applyTypeCommand(command.typeId, filters, objectTypes);
    }
    if (command.kind === 'field') {
      return applyFieldCommand(command.fieldId, filters, catalog);
    }
    if (command.kind === 'attr') {
      return applyAttrCommand(command.fieldId, command.operator, command.value, filters);
    }
    if (command.kind === 'area') {
      return applyAreaCommand(command.area || command.term, filters, lookup, resolveAreaTerm);
    }
    return filters;
  }

  function createInstance(options) {
    const {
      root,
      input,
      pillsEl,
      menuEl,
      getState,
      setSearchTerm,
      setSearchFilters,
      objectTypes,
      attributeCatalog,
      onChange,
      onSubmit,
      onGeographicInputClear,
      onSearchQueryChange,
      onAreaSuggestionSearch,
      onApplyArea,
      getLookup,
      resolveAreaTerm,
      getAreaSuggestions,
      isGeographicSearchEnabled = () => false,
    } = options;

    function geographicEnabled() {
      return isGeographicSearchEnabled();
    }

    let activeIndex = 0;
    let menuEntries = [];
    let selectableItems = [];

    function getFilters() {
      return getState().searchFilters;
    }

    function renderPills() {
      const filters = getFilters();
      const descriptors = buildPillDescriptors(filters, objectTypes);
      pillsEl.innerHTML = '';

      for (const pill of descriptors) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'smart-search-pill';
        let contentHtml = '';
        if (pill.kind === 'attr') {
          contentHtml = `<span class="smart-search-pill__value">${pill.label}</span>`;
        } else {
          contentHtml = `
            <span class="smart-search-pill__key">${pill.prefix}</span>
            <span class="smart-search-pill__value">${pill.label}</span>
          `;
        }
        button.innerHTML = `
          <span class="smart-search-pill__content">${contentHtml}</span>
          <span class="smart-search-pill__remove" aria-hidden="true">
            <svg viewBox="0 0 12 12" width="10" height="10" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round">
              <path d="M2.5 2.5l7 7M9.5 2.5l-7 7"/>
            </svg>
          </span>
        `;
        button.addEventListener('click', () => {
          const next = removePill(
            pill.kind,
            {
              typeId: pill.typeId,
              fieldId: pill.fieldId,
              ruleId: pill.ruleId,
              areaId: pill.areaId,
            },
            getFilters(),
            objectTypes
          );
          setSearchFilters(next);
          onChange();
        });
        pillsEl.appendChild(button);
      }
    }

    function syncInput() {
      if (isFilterCommandInput(input.value)) {
        return;
      }
      input.value = getState().searchTerm || '';
    }

    function syncDropdownFilterMode() {
      if (input.id !== 'viz-search-input') {
        return;
      }
      if (document.documentElement.dataset.vizVariant !== 'dropdown') {
        document.documentElement.classList.remove('viz-filter-command-active');
        return;
      }
      const active =
        isFilterCommandInput(input.value) || !menuEl.classList.contains('hidden');
      document.documentElement.classList.toggle('viz-filter-command-active', active);
    }

    function hideMenu() {
      menuEl.classList.add('hidden');
      menuEl.innerHTML = '';
      menuEntries = [];
      selectableItems = [];
      activeIndex = 0;
      syncDropdownFilterMode();
    }

    function renderMenu() {
      if (!isFilterCommandInput(input.value)) {
        hideMenu();
        return;
      }

      const filters = getFilters();
      const lookup = getLookup?.() || null;
      menuEntries = getSuggestions(
        input.value,
        objectTypes,
        attributeCatalog,
        filters,
        lookup,
        geographicEnabled() ? getAreaSuggestions : null,
        geographicEnabled()
      );
      selectableItems = flattenSelectableItems(menuEntries);
      if (selectableItems.length === 0) {
        hideMenu();
        return;
      }

      activeIndex = Math.min(activeIndex, selectableItems.length - 1);
      const activeId = selectableItems[activeIndex]?.id;

      menuEl.innerHTML = '';
      for (const entry of menuEntries) {
        if (entry.kind === 'section') {
          const section = document.createElement('div');
          section.className = 'smart-search-menu__section';
          const icon =
            window.ObjectIcons?.iconMarkup(entry.typeId, { size: 12, color: 'var(--text-muted)' }) || '';
          section.innerHTML = `
            <span class="smart-search-menu__section-icon">${icon}</span>
            <span class="smart-search-menu__section-label">${entry.label}</span>
            <span class="smart-search-menu__section-count">${entry.count}</span>
          `;
          menuEl.appendChild(section);
          continue;
        }

        const row = document.createElement('button');
        row.type = 'button';
        row.className = `smart-search-menu__item${entry.id === activeId ? ' smart-search-menu__item--active' : ''}`;
        row.setAttribute('role', 'option');
        row.dataset.suggestionId = entry.id;
        row.innerHTML = `
          <span class="smart-search-menu__label">${entry.label}</span>
          <span class="smart-search-menu__desc">${entry.description || ''}</span>
        `;
        row.addEventListener('mousedown', (event) => {
          event.preventDefault();
          const index = selectableItems.findIndex((item) => item.id === entry.id);
          if (index >= 0) {
            selectSuggestion(index);
          }
        });
        menuEl.appendChild(row);
      }

      menuEl.classList.remove('hidden');
      menuEl.querySelector('.smart-search-menu__item--active')?.scrollIntoView({ block: 'nearest' });
      syncDropdownFilterMode();
    }

    function selectSuggestion(index) {
      const item = selectableItems[index];
      if (!item) {
        return;
      }
      if (item.apply?.kind === 'area' && onApplyArea && geographicEnabled()) {
        onApplyArea(item.apply.area || item.apply.term, item.apply.displayName);
        input.value = '';
        setSearchTerm('');
        hideMenu();
        onChange();
        return;
      }
      if (item.apply) {
        const lookup = getLookup?.() || null;
        const next = applyParsedCommand(
          item.apply,
          getFilters(),
          objectTypes,
          attributeCatalog,
          lookup,
          resolveAreaTerm
        );
        setSearchFilters(next);
        input.value = '';
        setSearchTerm('');
        hideMenu();
        onChange();
        return;
      }
      input.value = item.insert ?? item.label;
      input.focus();
      renderMenu();
    }

    function tryApplyCommand() {
      const command = parseCommand(input.value, objectTypes, attributeCatalog, getFilters());
      if (!command) {
        return false;
      }
      if (command.kind === 'area') {
        if (!geographicEnabled() || !onApplyArea) {
          return false;
        }
        onApplyArea(command.area || command.term, command.displayName);
        input.value = '';
        setSearchTerm('');
        hideMenu();
        onChange();
        return true;
      }
      const lookup = getLookup?.() || null;
      const next = applyParsedCommand(
        command,
        getFilters(),
        objectTypes,
        attributeCatalog,
        lookup,
        resolveAreaTerm
      );
      setSearchFilters(next);
      input.value = '';
      setSearchTerm('');
      hideMenu();
      onChange();
      return true;
    }

    input.addEventListener('input', () => {
      onGeographicInputClear?.();
      const value = input.value;
      onSearchQueryChange?.(value);
      if (geographicEnabled() && /^area(?::|$)/i.test(value.trim())) {
        onAreaSuggestionSearch?.(value);
      }
      if (isFilterCommandInput(value)) {
        activeIndex = 0;
        renderMenu();
      } else {
        hideMenu();
        setSearchTerm(value);
      }
      syncDropdownFilterMode();
      onChange();
    });

    input.addEventListener('focus', () => {
      if (isFilterCommandInput(input.value)) {
        if (geographicEnabled() && /^area(?::|$)/i.test(input.value.trim())) {
          onAreaSuggestionSearch?.(input.value);
        }
        renderMenu();
      }
    });

    input.addEventListener('keydown', (event) => {
      const menuOpen = !menuEl.classList.contains('hidden');

      if (event.key === 'ArrowDown' && menuOpen) {
        event.preventDefault();
        activeIndex = Math.min(activeIndex + 1, selectableItems.length - 1);
        renderMenu();
        return;
      }

      if (event.key === 'ArrowUp' && menuOpen) {
        event.preventDefault();
        activeIndex = Math.max(activeIndex - 1, 0);
        renderMenu();
        return;
      }

      if (event.key === 'Enter') {
        event.preventDefault();
        if (menuOpen && selectableItems[activeIndex]) {
          selectSuggestion(activeIndex);
          return;
        }
        if (tryApplyCommand()) {
          return;
        }
        hideMenu();
        onSubmit?.();
        onChange();
        return;
      }

      if (event.key === 'Escape') {
        hideMenu();
      }

      if (event.key === 'Backspace' && !input.value && getFilters()) {
        const descriptors = buildPillDescriptors(getFilters(), objectTypes);
        const last = descriptors[descriptors.length - 1];
        if (last) {
          const next = removePill(
            last.kind,
            { typeId: last.typeId, fieldId: last.fieldId, ruleId: last.ruleId },
            getFilters(),
            objectTypes
          );
          setSearchFilters(next);
          onChange();
        }
      }
    });

    input.addEventListener('blur', () => {
      window.setTimeout(hideMenu, 120);
    });

    const instance = {
      renderPills,
      syncInput,
      renderMenu,
      focus: () => input.focus(),
    };

    renderPills();
    syncInput();
    return instance;
  }

  function syncAll() {
    for (const instance of instances) {
      instance.renderPills();
      instance.syncInput();
    }
  }

  function refreshMenus() {
    for (const instance of instances) {
      instance.renderMenu?.();
    }
  }

  function init(options) {
    const instance = createInstance(options);
    instances.push(instance);
    return instance;
  }

  window.SmartSearchBar = {
    init,
    syncAll,
    refreshMenus,
    buildPillDescriptors,
    parseCommand,
    applyParsedCommand,
    removePill,
    isFilterCommandInput,
    isCommandMenuOpen(menuEl) {
      return Boolean(menuEl && !menuEl.classList.contains('hidden'));
    },
  };
})();
