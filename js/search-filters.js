(function () {
  const METADATA_FIELDS = new Set(['QUELLSYSTEM', 'QUELLMODUL', 'QUELLINSTANZ', 'MANDANT', 'EXTRAKTIONSDATUM']);

  function createDefault(objectTypes) {
    return {
      types: new Set(objectTypes.map((type) => type.id)),
      searchFields: null,
      attributeRules: [],
    };
  }

  function clone(filters) {
    return {
      types: new Set(filters.types),
      searchFields: filters.searchFields ? new Set(filters.searchFields) : null,
      attributeRules: filters.attributeRules.map((rule) => ({ ...rule })),
    };
  }

  function buildAttributeCatalog(entities, objectTypes) {
    const byType = new Map(objectTypes.map((type) => [type.id, new Set()]));
    const allFields = new Map();

    for (const entity of entities) {
      for (const fieldId of Object.keys(entity.attributes || {})) {
        if (METADATA_FIELDS.has(fieldId)) {
          continue;
        }
        byType.get(entity.type)?.add(fieldId);
        if (!allFields.has(fieldId)) {
          allFields.set(fieldId, new Set());
        }
        allFields.get(fieldId).add(entity.type);
      }
    }

    return { byType, allFields };
  }

  function getAvailableFields(catalog, selectedTypes) {
    const fields = new Set();
    for (const typeId of selectedTypes) {
      for (const fieldId of catalog.byType.get(typeId) || []) {
        fields.add(fieldId);
      }
    }
    return [...fields].sort((a, b) => a.localeCompare(b));
  }

  function isRestrictedTypes(filters, totalTypeCount) {
    return filters.types.size > 0 && filters.types.size < totalTypeCount;
  }

  function hasActiveCriteria(term, filters, totalTypeCount) {
    return (
      Boolean(term.trim()) ||
      filters.attributeRules.length > 0 ||
      isRestrictedTypes(filters, totalTypeCount)
    );
  }

  function readAttributeValue(entity, fieldId) {
    const value = entity.attributes?.[fieldId];
    if (value === null || value === undefined) {
      return '';
    }
    return String(value).trim();
  }

  function entityMatchesAttributeRule(entity, rule) {
    const value = readAttributeValue(entity, rule.fieldId);

    if (rule.operator === 'exists') {
      return value.length > 0;
    }

    if (rule.operator === 'equals') {
      return value.toLowerCase() === String(rule.value || '').trim().toLowerCase();
    }

    return value.toLowerCase().includes(String(rule.value || '').trim().toLowerCase());
  }

  function describeRule(rule) {
    const label = window.DisplayNames.formatFieldLabel(rule.fieldId);
    if (rule.operator === 'exists') {
      return `${label} is set`;
    }
    if (rule.operator === 'equals') {
      return `${label} = ${rule.value}`;
    }
    return `${label} contains ${rule.value}`;
  }

  function describeSummary(filters, objectTypes, catalog = null) {
    const parts = [];
    const totalTypeCount = objectTypes.length;

    if (isRestrictedTypes(filters, totalTypeCount)) {
      const labels = [...filters.types].sort((a, b) => a.localeCompare(b));
      parts.push(labels.length === 1 ? labels[0] : `${labels.length} types`);
    }

    if (catalog && isRestrictedSearchFields(filters, catalog, filters.types)) {
      parts.push(`${filters.searchFields.size} search fields`);
    }

    if (filters.attributeRules.length) {
      parts.push(
        filters.attributeRules.length === 1
          ? describeRule(filters.attributeRules[0])
          : `${filters.attributeRules.length} attribute rules`
      );
    }

    return parts.join(' · ');
  }

  function isRestrictedSearchFields(filters, catalog, selectedTypes) {
    if (!filters.searchFields?.size) {
      return false;
    }
    const available = getAvailableFields(catalog, selectedTypes);
    return filters.searchFields.size < available.length;
  }

  function activeFilterCount(filters, objectTypes, catalog, selectedTypes = filters.types) {
    let count = 0;
    if (isRestrictedTypes(filters, objectTypes.length)) {
      count += 1;
    }
    if (isRestrictedSearchFields(filters, catalog, selectedTypes)) {
      count += 1;
    }
    count += filters.attributeRules.length;
    return count;
  }

  function getSearchMatchOptions(filters) {
    if (!filters.searchFields?.size) {
      return {};
    }
    return { allowedFields: filters.searchFields };
  }

  function buildSearchOptions(filters, lookup) {
    return {
      ...getSearchMatchOptions(filters),
      lookup,
    };
  }

  function filterEntities(entities, term, filters, objectTypes, lookup = null, limit = 100) {
    if (!hasActiveCriteria(term, filters, objectTypes.length)) {
      return [];
    }

    const searchOptions = buildSearchOptions(filters, lookup);

    return entities
      .filter((entity) => {
        if (filters.types.size > 0 && !filters.types.has(entity.type)) {
          return false;
        }

        for (const rule of filters.attributeRules) {
          if (!rule.fieldId) {
            continue;
          }
          if (!entityMatchesAttributeRule(entity, rule)) {
            return false;
          }
        }

        if (term.trim()) {
          return window.DisplayNames.entityMatchesSearch(entity, term, searchOptions);
        }

        return true;
      })
      .slice(0, limit);
  }

  function resolveResultMatch(entity, term, filters, lookup = null) {
    if (term.trim()) {
      return window.DisplayNames.resolveMatch(entity, term, buildSearchOptions(filters, lookup));
    }

    for (const rule of filters.attributeRules) {
      if (!rule.fieldId) {
        continue;
      }
      const value = readAttributeValue(entity, rule.fieldId);
      if (entityMatchesAttributeRule(entity, rule)) {
        return {
          fieldId: rule.fieldId,
          fieldLabel: window.DisplayNames.formatFieldLabel(rule.fieldId),
          value: value || '—',
        };
      }
    }

    return {
      fieldId: 'TYPE',
      fieldLabel: 'Object type',
      value: entity.type,
    };
  }

  function registerEntityAttributes(catalog, entity) {
    for (const fieldId of Object.keys(entity.attributes || {})) {
      if (METADATA_FIELDS.has(fieldId)) {
        continue;
      }
      if (!catalog.byType.has(entity.type)) {
        catalog.byType.set(entity.type, new Set());
      }
      catalog.byType.get(entity.type).add(fieldId);
      if (!catalog.allFields.has(fieldId)) {
        catalog.allFields.set(fieldId, new Set());
      }
      catalog.allFields.get(fieldId).add(entity.type);
    }
  }

  window.SearchFilters = {
    METADATA_FIELDS,
    createDefault,
    clone,
    buildAttributeCatalog,
    registerEntityAttributes,
    getAvailableFields,
    isRestrictedTypes,
    hasActiveCriteria,
    describeSummary,
    describeRule,
    activeFilterCount,
    filterEntities,
    resolveResultMatch,
    getSearchMatchOptions,
    entityMatchesAttributeRule,
  };
})();
