(function () {
  const METADATA_FIELDS = new Set(['QUELLSYSTEM', 'QUELLMODUL', 'QUELLINSTANZ', 'MANDANT', 'EXTRAKTIONSDATUM']);

  function cloneGeographicArea(area) {
    if (!area) {
      return null;
    }
    return {
      id: area.id,
      label: area.label,
      bounds: area.bounds ? [[...area.bounds[0]], [...area.bounds[1]]] : null,
      source: area.source || 'catalog',
      shape: area.shape || 'rectangle',
      polygon: area.polygon ? area.polygon.map((point) => ({ ...point })) : null,
      line: area.line ? area.line.map((point) => ({ ...point })) : null,
      center: area.center ? { ...area.center } : null,
      radiusMeters: area.radiusMeters ?? null,
      bufferMeters: area.bufferMeters ?? null,
    };
  }

  function createDefault(objectTypes) {
    return {
      types: new Set(objectTypes.map((type) => type.id)),
      searchFields: null,
      attributeRules: [],
      roleRules: [],
      geographicArea: null,
    };
  }

  function clone(filters) {
    return {
      types: new Set(filters.types),
      searchFields: filters.searchFields ? new Set(filters.searchFields) : null,
      attributeRules: filters.attributeRules.map((rule) => ({ ...rule })),
      roleRules: (filters.roleRules || []).map((rule) => ({ ...rule })),
      geographicArea: cloneGeographicArea(filters.geographicArea),
    };
  }

  function readRelationRoles(relation) {
    if (Array.isArray(relation.roles) && relation.roles.length > 0) {
      return relation.roles.map((role) => String(role || '').trim()).filter(Boolean);
    }
    const single = String(relation.role || '').trim();
    return single ? [single] : [];
  }

  function buildRoleCatalog(relations) {
    const roles = new Set();
    const index = new Map();

    for (const relation of relations || []) {
      for (const role of readRelationRoles(relation)) {
        roles.add(role);
        for (const entityId of [relation.from, relation.to]) {
          if (!index.has(entityId)) {
            index.set(entityId, new Set());
          }
          index.get(entityId).add(role);
        }
      }
    }

    return {
      roles: [...roles].sort((a, b) => a.localeCompare(b)),
      index,
    };
  }

  function entityHasRole(entityId, role, roleIndex) {
    if (!roleIndex || !entityId) {
      return false;
    }
    const entityRoles = roleIndex.get(entityId);
    if (!entityRoles) {
      return false;
    }
    const needle = String(role || '').trim().toLowerCase();
    for (const candidate of entityRoles) {
      if (String(candidate).trim().toLowerCase() === needle) {
        return true;
      }
    }
    return false;
  }

  function entityMatchesRoleRules(entity, roleRules, roleIndex) {
    if (!roleRules?.length) {
      return true;
    }
    for (const rule of roleRules) {
      if (!entityHasRole(entity.id, rule.role, roleIndex)) {
        return false;
      }
    }
    return true;
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
      (filters.roleRules?.length ?? 0) > 0 ||
      isRestrictedTypes(filters, totalTypeCount) ||
      Boolean(filters.geographicArea)
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

  function describeRoleRule(rule) {
    return rule.role;
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

    if (filters.roleRules?.length) {
      parts.push(
        filters.roleRules.length === 1
          ? describeRoleRule(filters.roleRules[0])
          : `${filters.roleRules.length} role filters`
      );
    }

    if (filters.geographicArea?.label) {
      parts.push(filters.geographicArea.label);
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
    count += filters.roleRules?.length ?? 0;
    if (filters.geographicArea) {
      count += 1;
    }
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

  function filterEntities(
    entities,
    term,
    filters,
    objectTypes,
    lookup = null,
    relations = [],
    roleIndex = null,
    limit = 5000
  ) {
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

        if (!entityMatchesRoleRules(entity, filters.roleRules, roleIndex)) {
          return false;
        }

        if (filters.geographicArea && lookup && window.MapLocations) {
          if (!window.MapLocations.entityHasGeoInArea(entity, filters.geographicArea, lookup, relations)) {
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

  function resolveResultMatch(entity, term, filters, lookup = null, roleIndex = null) {
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
          value: window.DisplayNames.formatAttributeValue(value, rule.fieldId),
        };
      }
    }

    for (const rule of filters.roleRules || []) {
      if (entityHasRole(entity.id, rule.role, roleIndex)) {
        return {
          fieldId: 'ROLE',
          fieldLabel: 'Role',
          value: rule.role,
        };
      }
    }

    if (filters.geographicArea?.label) {
      return {
        fieldId: 'AREA',
        fieldLabel: 'Area',
        value: filters.geographicArea.label,
      };
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
    buildRoleCatalog,
    readRelationRoles,
    entityHasRole,
    entityMatchesRoleRules,
    registerEntityAttributes,
    getAvailableFields,
    isRestrictedTypes,
    hasActiveCriteria,
    describeSummary,
    describeRule,
    describeRoleRule,
    activeFilterCount,
    filterEntities,
    resolveResultMatch,
    getSearchMatchOptions,
    entityMatchesAttributeRule,
  };
})();
