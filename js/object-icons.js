(function () {
  const SVG_NS = 'http://www.w3.org/2000/svg';

  const ICON_PATHS = {
    'Case File':
      '<path d="M5 4h7l2 2h9v15H5V4z" fill="currentColor" opacity="0.18"/><path d="M5 4h7l2 2h9v15H5V4z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M12 4v3h9" fill="none" stroke="currentColor" stroke-width="1.6"/>',
    Person:
      '<circle cx="12" cy="8.5" r="3.2" fill="currentColor"/><path d="M6.5 20.5c.8-3.2 3-5 5.5-5s4.7 1.8 5.5 5" fill="currentColor"/>',
    'Identity Record':
      '<circle cx="10.5" cy="8.5" r="3" fill="currentColor"/><path d="M5.5 20c.7-2.8 2.6-4.5 5-4.5s4.3 1.7 5 4.5" fill="currentColor"/><rect x="14.5" y="12" width="7" height="5" rx="1" fill="currentColor"/><path d="M16 14h3.5M16 15.5h2.5" stroke="#fff" stroke-width="0.9" stroke-linecap="round"/>',
    'Physical Description':
      '<circle cx="10" cy="8.5" r="3" fill="currentColor"/><path d="M5 20c.7-2.8 2.5-4.5 5-4.5s4.3 1.7 5 4.5" fill="currentColor"/><circle cx="17.5" cy="16" r="3.8" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M20.2 18.7 22 20.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>',
    Organisation:
      '<path d="M6 20V9l6-3 6 3v11" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M9.5 20v-5h5v5M4 20h16" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><path d="M10 11h1.5M12.5 11H14M10 13.5h1.5M12.5 13.5H14" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>',
    'Case Event':
      '<rect x="5" y="7" width="14" height="11" rx="2" fill="currentColor" opacity="0.18"/><rect x="5" y="7" width="14" height="11" rx="2" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M8 5.5V8M16 5.5V8M5 10.5h14" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>',
    'Regulatory Offence':
      '<path d="M8.5 16.5h7" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><path d="M12 4.5c-3.2 2.2-5.5 4.8-5.5 8.5v3.5h11V13c0-3.7-2.3-6.3-5.5-8.5Z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/>',
    'Tip and Lead':
      '<path d="M7 5h10v12H7V5z" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M9 9h6M9 12h4" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/><circle cx="16.5" cy="16.5" r="3.8" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M19 19l2.2 2.2" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>',
    'Police Measure':
      '<path d="M12 4 5 7v5c0 4.2 3 7.8 7 9 4-1.2 7-4.8 7-9V7l-7-3z" fill="currentColor" opacity="0.18"/><path d="M12 4 5 7v5c0 4.2 3 7.8 7 9 4-1.2 7-4.8 7-9V7l-7-3z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M9.5 12.5 11 14l3.5-4.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>',
    'Traffic Accident':
      '<circle cx="7" cy="16" r="2" fill="currentColor"/><circle cx="17" cy="8" r="2" fill="currentColor"/><path d="M8.5 15 15 9" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><circle cx="12" cy="12" r="1.3" fill="currentColor"/>',
    'Motor Vehicle':
      '<path d="M4 14h1.5l1.2-3.5h10.6L18.5 14H20v3H4v-3z" fill="currentColor" opacity="0.18"/><path d="M4 14h1.5l1.2-3.5h10.6L18.5 14H20v3H4v-3z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><circle cx="7.5" cy="17" r="1.3" fill="currentColor"/><circle cx="16.5" cy="17" r="1.3" fill="currentColor"/>',
    Location:
      '<path d="M12 21s6-5.2 6-10a6 6 0 1 0-12 0c0 4.8 6 10 6 10z" fill="currentColor" opacity="0.18"/><path d="M12 21s6-5.2 6-10a6 6 0 1 0-12 0c0 4.8 6 10 6 10z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><circle cx="12" cy="11" r="2.2" fill="currentColor"/>',
    Documents:
      '<path d="M8 4h8l3 3v13H8V4z" fill="currentColor" opacity="0.18"/><path d="M8 4h8l3 3v13H8V4z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M16 4v3h3" fill="none" stroke="currentColor" stroke-width="1.6"/>',
    'Criminal Offence':
      '<path d="M12 4 5 7v5c0 4.2 3 7.8 7 9 4-1.2 7-4.8 7-9V7l-7-3z" fill="currentColor" opacity="0.18"/><path d="M12 4 5 7v5c0 4.2 3 7.8 7 9 4-1.2 7-4.8 7-9V7l-7-3z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/>',
    Firearm:
      '<circle cx="12" cy="12" r="7" fill="none" stroke="currentColor" stroke-width="1.6"/><circle cx="12" cy="12" r="4" fill="none" stroke="currentColor" stroke-width="1.6"/><circle cx="12" cy="12" r="1.3" fill="currentColor"/>',
    'Duplicate Candidate':
      '<rect x="5" y="7" width="10" height="12" rx="1.5" fill="currentColor" opacity="0.18"/><rect x="5" y="7" width="10" height="12" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.6"/><rect x="9" y="5" width="10" height="12" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.6"/>',
    'Facial Recognition Request':
      '<rect x="5" y="7" width="14" height="11" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.6"/><circle cx="12" cy="12.5" r="2.5" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M5 7 3 5M19 7l2-2M5 18l-2 2M19 18l2 2" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>',
  };

  const DEFAULT_ICON =
    '<rect x="6" y="6" width="12" height="12" rx="2" fill="none" stroke="currentColor" stroke-width="1.6"/>';

  function iconMarkup(type, options = {}) {
    const size = options.size ?? 16;
    const color = options.color ?? 'currentColor';
    const className = options.className ? ` class="${options.className}"` : '';
    const paths = ICON_PATHS[type] || DEFAULT_ICON;

    return `<svg${className} xmlns="${SVG_NS}" width="${size}" height="${size}" viewBox="0 0 24 24" aria-hidden="true" style="color:${color}">${paths}</svg>`;
  }

  function appendSvgIcon(parent, type, x, y, size, color) {
    const group = document.createElementNS(SVG_NS, 'g');
    group.setAttribute('transform', `translate(${x - size / 2}, ${y - size / 2})`);
    group.setAttribute('pointer-events', 'none');

    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('width', String(size));
    svg.setAttribute('height', String(size));
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('aria-hidden', 'true');
    svg.style.color = color;
    svg.innerHTML = ICON_PATHS[type] || DEFAULT_ICON;

    group.appendChild(svg);
    parent.appendChild(group);
    return group;
  }

  function markerHtml(type, color, options = {}) {
    const selected = Boolean(options.selected);
    const title = options.title ? ` title="${String(options.title).replace(/"/g, '&quot;')}"` : '';
    const classes = ['map-marker', selected ? 'map-marker--selected' : ''].filter(Boolean).join(' ');
    return `
      <div class="${classes}" style="--marker-color:${color}"${title}>
        ${iconMarkup(type, { size: 16, color: '#ffffff' })}
      </div>
    `;
  }

  function popupHeaderHtml(type, color, title, subtitle) {
    return `
      <div class="map-popup">
        <div class="map-popup__header">
          ${iconMarkup(type, { size: 18, color, className: 'map-popup__icon' })}
          <div>
            <strong>${title}</strong>
            <div class="map-popup__sub">${subtitle}</div>
          </div>
        </div>
      </div>
    `;
  }

  window.ObjectIcons = {
    iconMarkup,
    appendSvgIcon,
    markerHtml,
    popupHeaderHtml,
  };
})();
