(function () {
  const SVG_NS = 'http://www.w3.org/2000/svg';
  const WIDTH = 960;
  const HEIGHT = 520;

  const GRAPH_TYPE_COLORS = {
    Person: '#0f9960',
    'Identity Record': '#48aff0',
    Organisation: '#4d7fe0',
    'Case File': '#4d7fe0',
    'Criminal Offence': '#e3a048',
    'Regulatory Offence': '#e3a048',
    'Traffic Accident': '#e3a048',
    'Case Event': '#e3a048',
    Firearm: '#9b72d8',
    Documents: '#9b72d8',
    'Physical Description': '#9b72d8',
    'Tip and Lead': '#9b72d8',
    'Police Measure': '#9b72d8',
    Location: '#e67a9b',
    'Motor Vehicle': '#3cb8a8',
  };

  function shadeColor(hex, amount) {
    const value = hex.replace('#', '');
    const num = Number.parseInt(value, 16);
    const r = Math.max(0, Math.min(255, ((num >> 16) & 255) + amount));
    const g = Math.max(0, Math.min(255, ((num >> 8) & 255) + amount));
    const b = Math.max(0, Math.min(255, (num & 255) + amount));
    return `rgb(${r}, ${g}, ${b})`;
  }

  function truncateLabel(label, max = 22) {
    if (label.length <= max) {
      return label;
    }
    return `${label.slice(0, max - 1)}…`;
  }

  function resolveTypeColor(type) {
    const fromMock = window.INVESTIGATION_MOCK?.objectTypes;
    if (fromMock) {
      const match = fromMock.find((entry) => entry.id === type);
      if (match?.color) {
        return match.color;
      }
    }
    return GRAPH_TYPE_COLORS[type] || '#6b7785';
  }

  function linkKey(from, to) {
    return [from, to].sort().join(':');
  }

  function formatCombinedRoles(roles) {
    const unique = [...new Set(roles.map((role) => String(role || '').trim()).filter(Boolean))];
    if (unique.length === 0) {
      return null;
    }
    if (unique.length <= 2) {
      return unique.join(' · ');
    }
    return `${unique.slice(0, 2).join(' · ')} +${unique.length - 2}`;
  }

  function createGraphState() {
    return {
      nodeIds: new Set(),
      links: [],
      linkKeys: new Set(),
      positions: new Map(),
      seedId: null,
    };
  }

  function createNode(entity, lookup, seedId) {
    return {
      id: entity.id,
      entity,
      type: entity.type,
      label: window.DisplayNames.displayName(entity, lookup),
      isSeed: entity.id === seedId,
    };
  }

  function getDirectRelationLinks(entityId, relations) {
    const links = [];
    for (const rel of relations) {
      if (rel.from === entityId) {
        links.push({ from: entityId, to: rel.to, label: rel.label, role: rel.role ?? null });
      } else if (rel.to === entityId) {
        links.push({ from: rel.from, to: entityId, label: rel.label, role: rel.role ?? null });
      }
    }
    return links;
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function nearestNodeDistance(graphState, x, y, ignoreId = null) {
    let nearest = Infinity;
    for (const [id, pos] of graphState.positions.entries()) {
      if (id === ignoreId) {
        continue;
      }
      nearest = Math.min(nearest, Math.hypot(pos.x - x, pos.y - y));
    }
    return nearest;
  }

  function findOpenPosition(graphState, anchor, preferredAngle, minDistance = 132) {
    for (let ring = 0; ring < 6; ring += 1) {
      const radius = 148 + ring * 52;
      for (let step = 0; step < 16; step += 1) {
        const angle = preferredAngle + (step * Math.PI) / 8;
        const x = clamp(anchor.x + Math.cos(angle) * radius, 80, WIDTH - 80);
        const y = clamp(anchor.y + Math.sin(angle) * radius, 70, HEIGHT - 70);
        if (nearestNodeDistance(graphState, x, y) >= minDistance) {
          return { x, y };
        }
      }
    }

    return {
      x: clamp(anchor.x + Math.cos(preferredAngle) * 168, 80, WIDTH - 80),
      y: clamp(anchor.y + Math.sin(preferredAngle) * 168, 70, HEIGHT - 70),
    };
  }

  function resolveOverlaps(graphState, minDistance = 132) {
    const ids = [...graphState.nodeIds];
    for (let pass = 0; pass < 18; pass += 1) {
      for (let i = 0; i < ids.length; i += 1) {
        for (let j = i + 1; j < ids.length; j += 1) {
          const a = graphState.positions.get(ids[i]);
          const b = graphState.positions.get(ids[j]);
          if (!a || !b) {
            continue;
          }
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const distance = Math.hypot(dx, dy) || 1;
          if (distance >= minDistance) {
            continue;
          }
          const push = (minDistance - distance) / 2;
          const nx = dx / distance;
          const ny = dy / distance;
          a.x = clamp(a.x - nx * push, 80, WIDTH - 80);
          a.y = clamp(a.y - ny * push, 70, HEIGHT - 70);
          b.x = clamp(b.x + nx * push, 80, WIDTH - 80);
          b.y = clamp(b.y + ny * push, 70, HEIGHT - 70);
        }
      }
    }
  }

  function countAnchorChildren(graphState, anchorId) {
    let count = 0;
    for (const link of graphState.links) {
      if (link.from === anchorId || link.to === anchorId) {
        count += 1;
      }
    }
    return count;
  }

  function computeNodePosition(graphState, entityId, options = {}) {
    if (graphState.positions.has(entityId)) {
      return graphState.positions.get(entityId);
    }

    if (graphState.positions.size === 0) {
      return { x: WIDTH / 2, y: HEIGHT / 2 + 10 };
    }

    if (options.anchorId && graphState.positions.has(options.anchorId)) {
      const anchor = graphState.positions.get(options.anchorId);
      const total = Math.max(options.neighborTotal || 1, 1);
      const index = options.neighborIndex ?? countAnchorChildren(graphState, options.anchorId);
      const angle = (Math.PI * 2 * index) / total - Math.PI / 2;
      return findOpenPosition(graphState, anchor, angle);
    }

    const index = graphState.positions.size;
    const col = index % 5;
    const row = Math.floor(index / 5);
    return {
      x: 120 + col * 165,
      y: 90 + row * 120,
    };
  }

  function addNode(graphState, entityId, lookup, options = {}) {
    const entity = lookup.get(entityId);
    if (!entity || graphState.nodeIds.has(entityId)) {
      return false;
    }

    graphState.nodeIds.add(entityId);
    if (!graphState.seedId) {
      graphState.seedId = entityId;
    }

    graphState.positions.set(entityId, computeNodePosition(graphState, entityId, options));
    resolveOverlaps(graphState);
    return true;
  }

  function removeNode(graphState, entityId) {
    if (!graphState.nodeIds.has(entityId)) {
      return false;
    }

    graphState.nodeIds.delete(entityId);
    graphState.positions.delete(entityId);
    if (graphState.seedId === entityId) {
      graphState.seedId = graphState.nodeIds.size > 0 ? [...graphState.nodeIds][0] : null;
    }

    graphState.links = graphState.links.filter((link) => link.from !== entityId && link.to !== entityId);
    graphState.linkKeys = new Set(graphState.links.map((link) => linkKey(link.from, link.to)));
    return true;
  }

  function addLink(graphState, from, to, label, role = null) {
    if (!graphState.nodeIds.has(from) || !graphState.nodeIds.has(to)) {
      return false;
    }

    const key = linkKey(from, to);
    const normalizedRole = String(role || '').trim() || null;
    const existing = graphState.links.find((link) => linkKey(link.from, link.to) === key);

    if (existing) {
      if (normalizedRole) {
        const roles = existing.roles ?? (existing.role ? [existing.role] : []);
        if (!roles.includes(normalizedRole)) {
          roles.push(normalizedRole);
          existing.roles = roles;
          existing.role = formatCombinedRoles(roles);
        }
      }
      return false;
    }

    graphState.linkKeys.add(key);
    const link = { from, to, label, role: normalizedRole };
    if (normalizedRole) {
      link.roles = [normalizedRole];
    }
    graphState.links.push(link);
    return true;
  }

  function formatLinkAnnotationFull(link) {
    return String(link.role || '').trim();
  }

  function formatLinkAnnotation(link) {
    const role = formatLinkAnnotationFull(link);
    if (!role) {
      return '';
    }
    return truncateLabel(role, 22);
  }

  function appendGraphLink(parent, link, fromPos, toPos) {
    const x1 = fromPos.x;
    const y1 = fromPos.y + 8;
    const x2 = toPos.x;
    const y2 = toPos.y + 8;
    const annotation = formatLinkAnnotation(link);

    const group = createSvgEl('g', {
      class: 'graph-link-group',
      'data-from': link.from,
      'data-to': link.to,
    });

    group.appendChild(
      createSvgEl('line', {
        class: 'graph-link',
        x1,
        y1,
        x2,
        y2,
        stroke: '#b8c2cc',
        'stroke-width': 1.6,
        'stroke-linecap': 'round',
      })
    );

    if (annotation) {
      const mx = (x1 + x2) / 2;
      const my = (y1 + y2) / 2;
      const paddingX = 6;
      const paddingY = 3;
      const charWidth = 5.6;
      const textWidth = annotation.length * charWidth;
      const textHeight = 11;
      const fullAnnotation = formatLinkAnnotationFull(link);
      const labelGroup = createSvgEl('g', {
        class: 'graph-link__label',
        transform: `translate(${mx}, ${my})`,
        'data-full-label': fullAnnotation,
      });

      labelGroup.appendChild(
        createSvgEl('rect', {
          class: 'graph-link__label-bg',
          x: -textWidth / 2 - paddingX,
          y: -textHeight / 2 - paddingY,
          width: textWidth + paddingX * 2,
          height: textHeight + paddingY * 2,
          rx: 4,
        })
      );

      const text = createSvgEl('text', {
        class: 'graph-link__label-text',
        'text-anchor': 'middle',
        'dominant-baseline': 'middle',
      });
      text.textContent = annotation;
      labelGroup.appendChild(text);

      group.appendChild(labelGroup);
    }

    parent.appendChild(group);
  }

  function createSvgEl(name, attrs = {}) {
    const el = document.createElementNS(SVG_NS, name);
    for (const [key, value] of Object.entries(attrs)) {
      el.setAttribute(key, String(value));
    }
    return el;
  }

  function drawGridBackground(parent) {
    const defs = createSvgEl('defs');
    const pattern = createSvgEl('pattern', {
      id: 'iso-grid',
      width: 48,
      height: 28,
      patternUnits: 'userSpaceOnUse',
    });

    pattern.appendChild(
      createSvgEl('path', {
        d: 'M0 14 L24 0 L48 14 L24 28 Z',
        fill: 'none',
        stroke: '#e3e7ec',
        'stroke-width': 1,
      })
    );
    defs.appendChild(pattern);
    parent.appendChild(defs);

    parent.appendChild(createSvgEl('rect', { x: 0, y: 0, width: WIDTH, height: HEIGHT, fill: '#f7f8fa' }));
    parent.appendChild(
      createSvgEl('rect', { x: 0, y: 0, width: WIDTH, height: HEIGHT, fill: 'url(#iso-grid)', opacity: 0.85 })
    );
  }

  function isNodeSelected(nodeId, selectedId, multiSelectedIds) {
    if (multiSelectedIds instanceof Set && multiSelectedIds.size > 0) {
      return multiSelectedIds.has(nodeId);
    }
    return nodeId === selectedId;
  }

  function appendIsometricNode(parent, node, position, selectedId, multiSelectedIds = null) {
    const isSeed = node.isSeed;
    const isSelected = isNodeSelected(node.id, selectedId, multiSelectedIds);
    const scale = isSeed || isSelected ? 1.12 : 1;
    const color = resolveTypeColor(node.type);
    const tooltipText = `${node.label}, ${node.type}`;
    const w = 17 * scale;
    const d = 8.5 * scale;
    const h = 11 * scale;
    const baseY = 12 * scale;
    const topY = baseY - h - d;

    const group = createSvgEl('g', {
      class: `graph-node${isSelected ? ' graph-node--selected' : ''}${isSeed ? ' graph-node--seed' : ''}`,
      transform: `translate(${position.x}, ${position.y})`,
      'data-entity-id': node.id,
      'data-entity-type': node.type,
      'aria-label': tooltipText,
    });

    group.appendChild(
      createSvgEl('ellipse', {
        class: 'graph-node__shadow',
        cx: 0,
        cy: baseY + 5,
        rx: 24 * scale,
        ry: 7 * scale,
      })
    );
    group.appendChild(
      createSvgEl('ellipse', {
        class: 'graph-node__pedestal',
        cx: 0,
        cy: baseY + 1,
        rx: 21 * scale,
        ry: 6.5 * scale,
      })
    );
    group.appendChild(
      createSvgEl('path', {
        class: 'graph-node__face graph-node__face--right',
        d: `M 0 ${topY + d} L ${w} ${topY} L ${w} ${topY + h} L 0 ${topY + d + h} Z`,
        fill: shadeColor(color, -34),
      })
    );
    group.appendChild(
      createSvgEl('path', {
        class: 'graph-node__face graph-node__face--left',
        d: `M 0 ${topY + d} L ${-w} ${topY} L ${-w} ${topY + h} L 0 ${topY + d + h} Z`,
        fill: shadeColor(color, -16),
      })
    );
    group.appendChild(
      createSvgEl('path', {
        class: 'graph-node__face graph-node__face--top',
        d: `M 0 ${topY - d} L ${w} ${topY} L 0 ${topY + d} L ${-w} ${topY} Z`,
        fill: color,
      })
    );

    window.ObjectIcons.appendSvgIcon(group, node.type, 0, topY - 1, isSeed || isSelected ? 16 : 14, '#ffffff');

    const label = createSvgEl('text', {
      class: 'graph-node__label',
      x: 0,
      y: baseY + 24 * scale,
      'text-anchor': 'middle',
    });
    label.textContent = truncateLabel(node.label);
    group.appendChild(label);

    parent.appendChild(group);
  }

  function renderGraphState(
    svgEl,
    graphState,
    lookup,
    selectedId = null,
    viewport = { x: 0, y: 0, scale: 1 },
    multiSelectedIds = null
  ) {
    svgEl.innerHTML = '';
    svgEl.setAttribute('viewBox', `0 0 ${WIDTH} ${HEIGHT}`);

    if (graphState.nodeIds.size === 0) {
      drawGridBackground(svgEl);
      return { nodeCount: 0, linkCount: 0 };
    }

    const viewportGroup = createSvgEl('g', {
      class: 'graph-viewport',
      transform: `translate(${viewport.x}, ${viewport.y}) scale(${viewport.scale})`,
    });
    drawGridBackground(viewportGroup);

    const nodes = [...graphState.nodeIds]
      .map((id) => lookup.get(id))
      .filter(Boolean)
      .map((entity) => createNode(entity, lookup, graphState.seedId));

    const linksLayer = createSvgEl('g', { class: 'graph-links' });
    for (const link of graphState.links) {
      const from = graphState.positions.get(link.from);
      const to = graphState.positions.get(link.to);
      if (!from || !to) {
        continue;
      }
      appendGraphLink(linksLayer, link, from, to);
    }
    viewportGroup.appendChild(linksLayer);

    const nodesLayer = createSvgEl('g', { class: 'graph-nodes' });
    for (const node of nodes) {
      const position = graphState.positions.get(node.id);
      if (!position) {
        continue;
      }
      appendIsometricNode(nodesLayer, node, position, selectedId, multiSelectedIds);
    }
    viewportGroup.appendChild(nodesLayer);
    svgEl.appendChild(viewportGroup);

    return { nodeCount: nodes.length, linkCount: graphState.links.length };
  }

  function setNodePosition(graphState, entityId, x, y) {
    if (!graphState.positions.has(entityId)) {
      return;
    }
    graphState.positions.set(entityId, {
      x: clamp(x, 40, WIDTH - 40),
      y: clamp(y, 40, HEIGHT - 40),
    });
  }

  function clearGraphSvg(svgEl) {
    svgEl.innerHTML = '';
  }

  window.GraphView = {
    WIDTH,
    HEIGHT,
    GRAPH_TYPE_COLORS,
    createGraphState,
    addNode,
    removeNode,
    addLink,
    getDirectRelationLinks,
    resolveOverlaps,
    setNodePosition,
    renderGraphState,
    clearGraphSvg,
  };
})();
