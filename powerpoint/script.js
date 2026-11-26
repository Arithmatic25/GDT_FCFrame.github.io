'use strict';


const SYMBOLS = {
  straightness: { name: 'Straightness', category: 'Form', glyph: '⏤', allowsDatums: false, allowsMaterial: true },
  flatness: { name: 'Flatness', category: 'Form', glyph: '⏥', allowsDatums: false, allowsMaterial: false },
  circularity: { name: 'Circularity', category: 'Form', glyph: '○', allowsDatums: false, allowsMaterial: false },
  cylindricity: { name: 'Cylindricity', category: 'Form', glyph: '⌭', allowsDatums: false, allowsMaterial: false },
  'line-profile': { name: 'Profile of a line', category: 'Profile', glyph: '⌒', allowsDatums: true, allowsMaterial: false, composite: true },
  'surface-profile': { name: 'Profile of a surface', category: 'Profile', glyph: '⌓', allowsDatums: true, allowsMaterial: false, composite: true },
  angularity: { name: 'Angularity', category: 'Orientation', glyph: '∠', allowsDatums: true, allowsMaterial: true },
  perpendicularity: { name: 'Perpendicularity', category: 'Orientation', glyph: '⊥', allowsDatums: true, allowsMaterial: true },
  parallelism: { name: 'Parallelism', category: 'Orientation', glyph: '∥', allowsDatums: true, allowsMaterial: true },
  position: { name: 'Position', category: 'Location', glyph: '⌖', allowsDatums: true, allowsMaterial: true, composite: true },
  'circular-runout': { name: 'Circular runout', category: 'Runout', glyph: '↗', allowsDatums: true, allowsMaterial: false },
  'total-runout': { name: 'Total runout', category: 'Runout', glyph: '⌰', allowsDatums: true, allowsMaterial: false }
};

const SYMBOL_ORDER = [
  'straightness', 'flatness', 'circularity', 'cylindricity',
  'line-profile', 'surface-profile',
  'angularity', 'perpendicularity', 'parallelism',
  'position', 'circular-runout', 'total-runout'
];

const VALID_DATUM = /^(?!.*[IOQ])[A-HJ-NP-Z]{1,3}(?:-(?!.*[IOQ])[A-HJ-NP-Z]{1,3})?$/;
const VALID_DATUM_TARGET = /^(?!.*[IOQ])[A-HJ-NP-Z]{1,3}[0-9]{1,3}$/;
const MAX_ROWS = 4;

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

function datum(letter = '', boundary = '') {
  return { letter, boundary };
}

function row(overrides = {}) {
  return {
    symbol: 'position',
    zone: 'diameter',
    tolerance: '1.0',
    material: '',
    requirement: '',
    requirementValue: '',
    projected: false,
    projection: '',
    datums: [datum('A'), datum('B'), datum('C')],
    ...overrides,
    datums: (overrides.datums || [datum('A'), datum('B'), datum('C')]).map((item) => datum(item.letter, item.boundary))
  };
}

const FRAME_FILLS = {
  hes: '#ffbf45',
  dwg: '#d0d2d5',
  oth: '#000000',
  adc: '#ee718a',
  ega: '#ffffff'
};

function initialState() {
  return {
    mode: 'single',
    rows: [row({ symbol: 'surface-profile', zone: 'none', tolerance: '1.0' })],
    annotation: { type: 'none', text: '', targetSize: '10', targetDiameter: true, placement: 'below', only: false },
    fillPreset: 'hes',
    color: FRAME_FILLS.hes,
    transparent: false,

    units: 'mm'
  };
}

let state = initialState();
let selectedRow = 0;
let latestSvg = null;
let toastTimer = null;

const els = {
  units: $('#units'),
  modeButtons: $$('[data-mode]'),
  rowEditors: $('#row-editors'),
  addRow: $('#add-row'),
  rowActions: $('#row-actions'),
  editRow: $('#edit-row'),

  preview: $('#frame-preview'),




  transparent: $('#transparent-bg'),
  color: $('#frame-color'),
  annotationType: $('#annotation-type'),
  annotationText: $('#annotation-text'),
  annotationTextField: $('.annotation-text-field'),
  annotationGrid: $('.annotation-grid'),
  annotationTargetSize: $('#annotation-target-size'),
  annotationTargetSizeField: $('.annotation-target-size-field'),
  annotationTargetPrefix: $('#annotation-target-prefix'),
  annotationPlacement: $('#annotation-placement'),
  annotationPlacementField: $('.annotation-placement-field'),
  annotationOnly: $('#annotation-only'),
  annotationOnlyControl: $('.annotation-only-control'),
  annotationTextLabel: $('#annotation-text-label'),

  toast: $('#toast'),
};

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  }[character]));
}

function escapeXml(value) {
  return escapeHtml(value);
}

function cleanColor(value) {
  return /^#[0-9a-f]{6}$/i.test(value) ? value.toLowerCase() : '#142c39';
}

function cleanShortText(value, maximum = 60) {
  return String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, maximum);
}

function cleanTargetSize(value) {
  return cleanShortText(value, 20).replace(/^⌀\s*/, '');
}

function cleanSharedRow(candidate = {}) {
  const symbol = Object.hasOwn(SYMBOLS, candidate.symbol) ? candidate.symbol : 'position';
  const datums = Array.isArray(candidate.datums) ? candidate.datums.slice(0, 3) : [];
  while (datums.length < 3) datums.push(datum(''));
  return row({
    symbol,
    zone: ['diameter', 'none'].includes(candidate.zone) ? candidate.zone : 'none',
    tolerance: cleanShortText(candidate.tolerance, 20) || '—',
    material: ['', 'Ⓜ', 'Ⓛ'].includes(candidate.material) ? candidate.material : '',
    requirement: ['', 'Ⓣ', 'Ⓕ', 'Ⓤ'].includes(candidate.requirement) ? candidate.requirement : '',
    requirementValue: cleanShortText(candidate.requirementValue, 20),
    projected: Boolean(candidate.projected),
    projection: cleanShortText(candidate.projection, 20),
    datums: datums.map((item) => datum(
      cleanShortText(item?.letter, 7).toUpperCase(),
      ['', 'Ⓜ', 'Ⓛ'].includes(item?.boundary) ? item.boundary : ''
    ))
  });
}

function normalizeSharedState(candidate) {
  const normalized = initialState();
  if (!candidate || typeof candidate !== 'object') return normalized;
  normalized.mode = ['single', 'composite', 'stacked'].includes(candidate.mode) ? candidate.mode : 'single';
  if (Array.isArray(candidate.rows) && candidate.rows.length) normalized.rows = candidate.rows.slice(0, MAX_ROWS).map(cleanSharedRow);
  if (normalized.mode === 'single') normalized.rows = normalized.rows.slice(0, 1);
  if (normalized.mode !== 'single' && normalized.rows.length < 2) normalized.rows.push(cleanSharedRow({ symbol: normalized.rows[0]?.symbol || 'position', tolerance: '0.2' }));
  if (normalized.mode === 'composite') {
    if (!SYMBOLS[normalized.rows[0].symbol].composite) normalized.rows[0].symbol = 'position';
    normalized.rows.forEach((frameRow) => { frameRow.symbol = normalized.rows[0].symbol; });
  }
  const annotation = candidate.annotation || {};
  const suppliedTargetSize = cleanShortText(annotation.targetSize, 20);
  const annotationType = ['none', 'free', 'boxed', 'datum', 'datum-target'].includes(annotation.type) ? annotation.type : 'none';
  const datumLikeAnnotation = ['datum', 'datum-target'].includes(annotationType);
  const normalizedAnnotationText = cleanShortText(annotation.text, datumLikeAnnotation ? 7 : 60);
  normalized.annotation = {
    type: annotationType,
    text: datumLikeAnnotation ? normalizedAnnotationText.toUpperCase() : normalizedAnnotationText,
    targetSize: cleanTargetSize(suppliedTargetSize),
    targetDiameter: suppliedTargetSize.startsWith('⌀') || annotation.targetDiameter !== false,
    placement: ['above', 'below'].includes(annotation.placement) ? annotation.placement : 'below',
    only: Boolean(annotation.only) && annotationType !== 'none'
  };
  if (candidate.color) {
    normalized.color = cleanColor(candidate.color);
    normalized.fillPreset = 'custom';
  }
  normalized.transparent = Boolean(candidate.transparent);

  normalized.units = candidate.units === 'in' ? 'in' : 'mm';
  return normalized;
}

function decodeSharedState(encoded) {
  if (!encoded || encoded.length > 12000 || !/^[A-Za-z0-9_-]+$/.test(encoded)) return null;
  try {
    const base64 = encoded.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(encoded.length / 4) * 4, '=');
    const bytes = Uint8Array.from(atob(base64), (character) => character.charCodeAt(0));
    return normalizeSharedState(JSON.parse(new TextDecoder().decode(bytes)));
  } catch (error) {
    return null;
  }
}

function formatNumber(value, places = 4) {
  if (!Number.isFinite(Number(value))) return '—';
  return Number(value).toFixed(places).replace(/\.0+$|(?<=\.[0-9]*?)0+$/g, '').replace(/\.$/, '');
}

function formatInputNumber(value) {
  return formatNumber(value, state.units === 'mm' ? 4 : 5);
}

function symbolOptions(selected, compositeOnly = false) {
  const grouped = {};
  SYMBOL_ORDER.forEach((id) => {
    const item = SYMBOLS[id];
    if (compositeOnly && !item.composite) return;
    (grouped[item.category] ||= []).push([id, item]);
  });
  return Object.entries(grouped).map(([category, entries]) => (
    `<optgroup label="${category}">${entries.map(([id, item]) => (
      `<option value="${id}"${id === selected ? ' selected' : ''}>${escapeHtml(item.name)}</option>`
    )).join('')}</optgroup>`
  )).join('');
}

function rowLabel(index) {
  if (state.mode === 'composite') return index === 0 ? ['Upper segment', 'Pattern locating'] : [`Lower segment ${index}`, 'Feature relating'];
  if (state.mode === 'stacked') return [`Control ${index + 1}`, 'Independent requirement'];
  return ['Tolerance row', 'Single requirement'];
}

function datumToken(item) {
  const letter = item.letter.trim().toUpperCase();
  return letter ? `${letter}${item.boundary}` : '';
}

function activeDatums(frameRow) {
  return frameRow.datums.map(datumToken).filter(Boolean);
}

function toleranceToken(frameRow) {
  const zone = frameRow.zone === 'diameter' ? '⌀' : '';
  const tolerance = frameRow.tolerance.trim() || '—';
  const material = frameRow.material || '';
  const requirement = frameRow.requirement
    ? `${frameRow.requirement}${frameRow.requirement === 'Ⓤ' && frameRow.requirementValue ? ` ${frameRow.requirementValue}` : ''}`
    : '';
  const projection = frameRow.projected ? `Ⓟ${frameRow.projection ? ` ${frameRow.projection}` : ''}` : '';
  return [zone + tolerance + material, requirement, projection].filter(Boolean).join(' ');
}

function annotationText() {
  const text = cleanShortText(state.annotation.text, 60);
  return ['datum', 'datum-target'].includes(state.annotation.type) ? text.toUpperCase() : text;
}

function datumTargetSizeText() {
  const size = cleanTargetSize(state.annotation.targetSize);
  return size ? `${state.annotation.targetDiameter === false ? '' : '⌀'}${size}` : '';
}

function annotationSummaryText() {
  if (state.annotation.type !== 'datum-target') return annotationText();
  return [datumTargetSizeText(), annotationText()].filter(Boolean).join(' / ');
}

function hasAnnotation() {
  return state.annotation.type !== 'none' && Boolean(annotationText());
}

function isAnnotationOnly() {
  return state.annotation.type !== 'none' && state.annotation.only;
}

function updateAnnotationEditor() {
  const visible = state.annotation.type !== 'none';
  const isDatum = state.annotation.type === 'datum';
  const isDatumTarget = state.annotation.type === 'datum-target';
  els.annotationType.value = state.annotation.type;
  els.annotationGrid.classList.toggle('is-datum-target', isDatumTarget);
  els.annotationTextField.hidden = !visible;
  els.annotationTargetSizeField.hidden = !isDatumTarget;
  els.annotationPlacementField.hidden = !visible || (state.annotation.only && !isDatum);
  els.annotationOnlyControl.hidden = !visible;
  els.annotationText.value = state.annotation.text;
  els.annotationTargetSize.value = state.annotation.targetSize;
  els.annotationTargetPrefix.value = state.annotation.targetDiameter === false ? 'none' : 'diameter';
  els.annotationPlacement.value = state.annotation.placement;
  els.annotationOnly.checked = state.annotation.only;
  els.annotationText.maxLength = isDatum || isDatumTarget ? 7 : 60;
  els.annotationTextLabel.textContent = isDatumTarget ? 'Datum target ID' : isDatum ? 'Datum identifier' : state.annotation.type === 'boxed' ? 'Boxed text' : 'Annotation text';
  els.annotationText.placeholder = isDatumTarget ? 'A1' : isDatum ? 'A' : state.annotation.type === 'boxed' ? 'BASIC DIMENSION' : 'Add a drawing note';

}

function rowSignature(frameRow) {
  return `${SYMBOLS[frameRow.symbol].glyph} | ${toleranceToken(frameRow)}${activeDatums(frameRow).length ? ` | ${activeDatums(frameRow).join(' | ')}` : ''}`;
}

function rowWarning(frameRow, index) {
  const symbol = SYMBOLS[state.mode === 'composite' ? state.rows[0].symbol : frameRow.symbol];
  const datums = activeDatums(frameRow);
  const messages = [];

  if (!symbol.allowsDatums && datums.length) messages.push(`${symbol.name} is a form control and normally has no datum references.`);
  if (!symbol.allowsMaterial && frameRow.material) messages.push(`MMC/LMC is not valid for this ${symbol.name} tolerance.`);
  if (frameRow.projected && symbol.name !== 'Position') messages.push('Projected tolerance zones are normally used with position controls for threaded holes, studs, or pins.');
  if (frameRow.requirement === 'Ⓤ' && !symbol.name.includes('Profile')) messages.push('Unequally disposed Ⓤ applies to profile tolerances.');

  frameRow.datums.forEach((item) => {
    const label = item.letter.trim().toUpperCase();
    if (label && !VALID_DATUM.test(label)) messages.push(`Datum “${label}” is not a valid ASME datum label; I, O, and Q are omitted.`);
  });

  if (state.mode === 'composite') {
    if (!SYMBOLS[state.rows[0].symbol].composite) messages.push('Composite frames are supported for position and profile controls.');
    if (index > 0) {
      const upper = state.rows[0];
      const upperDatums = activeDatums(upper);
      const prefixValid = datums.every((token, datumIndex) => token === upperDatums[datumIndex]) && datums.length <= upperDatums.length;
      if (!prefixValid) messages.push('A lower composite datum sequence must be blank or an exact left-to-right prefix of the upper sequence, including modifiers.');
      const upperTolerance = Number(upper.tolerance);
      const lowerTolerance = Number(frameRow.tolerance);
      if (Number.isFinite(upperTolerance) && Number.isFinite(lowerTolerance) && lowerTolerance > upperTolerance) {
        messages.push('A lower composite tolerance normally refines the upper segment and should not be larger.');
      }
      if (frameRow.projected !== upper.projected || (frameRow.projected && frameRow.projection !== upper.projection)) {
        messages.push('When a projected zone is used in a composite control, keep it consistent in every segment.');
      }
    }
  }

  return messages;
}

function renderRowEditor(frameRow, index) {
  const [title] = rowLabel(index);
  const shared = state.mode === 'composite' && index > 0;
  const warning = rowWarning(frameRow, index);
  const symbol = SYMBOLS[state.rows[0].symbol];

  return `
    <article class="row-card" data-row-card="${index}">
      <div class="row-card-body">
        <div class="control-grid">
          <label class="field">
            <span>Characteristic</span>
            ${shared
              ? `<span class="shared-symbol">${iconSvg(frameRow.symbol)}${escapeHtml(symbol.name)} · shared</span>`
              : `<select data-row="${index}" data-field="symbol">${symbolOptions(frameRow.symbol, state.mode === 'composite')}</select>`}
          </label>
          <label class="field">
            <span>Zone</span>
            <select data-row="${index}" data-field="zone">
              <option value="diameter"${frameRow.zone === 'diameter' ? ' selected' : ''}>⌀ Dia.</option>
              <option value="none"${frameRow.zone === 'none' ? ' selected' : ''}>None</option>
            </select>
          </label>
          <label class="field">
            <span>Tolerance</span>
            <input data-row="${index}" data-field="tolerance" value="${escapeHtml(frameRow.tolerance)}" inputmode="decimal" aria-label="Tolerance for ${title}">
          </label>
        </div>

        <div class="control-grid">
          <label class="field">
            <span>Material</span>
            <select data-row="${index}" data-field="material">
              <option value=""${!frameRow.material ? ' selected' : ''}>RFS / none</option>
              <option value="Ⓜ"${frameRow.material === 'Ⓜ' ? ' selected' : ''}>MMC Ⓜ</option>
              <option value="Ⓛ"${frameRow.material === 'Ⓛ' ? ' selected' : ''}>LMC Ⓛ</option>
            </select>
          </label>
          <label class="field">
            <span>Modifier</span>
            <select data-row="${index}" data-field="requirement">
              <option value=""${!frameRow.requirement ? ' selected' : ''}>None</option>
              <option value="Ⓣ"${frameRow.requirement === 'Ⓣ' ? ' selected' : ''}>Tangent plane Ⓣ</option>
              <option value="Ⓕ"${frameRow.requirement === 'Ⓕ' ? ' selected' : ''}>Free state Ⓕ</option>
              <option value="Ⓤ"${frameRow.requirement === 'Ⓤ' ? ' selected' : ''}>Unequal profile Ⓤ</option>
            </select>
          </label>
          ${frameRow.requirement === 'Ⓤ'
            ? `<label class="field"><span>Unequal offset</span><input data-row="${index}" data-field="requirementValue" value="${escapeHtml(frameRow.requirementValue)}" inputmode="decimal"></label>`
            : `<label class="inline-check"><input data-row="${index}" data-field="projected" type="checkbox"${frameRow.projected ? ' checked' : ''}> Projected zone Ⓟ</label>`}
        </div>

        ${frameRow.requirement === 'Ⓤ'
          ? `<div class="control-grid"><label class="inline-check"><input data-row="${index}" data-field="projected" type="checkbox"${frameRow.projected ? ' checked' : ''}> Projected zone Ⓟ</label>${frameRow.projected ? `<label class="field projected-field"><span>Projection height</span><input data-row="${index}" data-field="projection" value="${escapeHtml(frameRow.projection)}" inputmode="decimal"><small data-unit>${state.units}</small></label>` : ''}</div>`
          : frameRow.projected ? `<div class="control-grid"><label class="field projected-field"><span>Projection height</span><input data-row="${index}" data-field="projection" value="${escapeHtml(frameRow.projection)}" inputmode="decimal"><small data-unit>${state.units}</small></label></div>` : ''}

        <div class="datum-section">
          <div class="datum-section-head"><p class="datum-title">Datum references</p></div>
          <div class="datum-grid">
            ${frameRow.datums.map((item, datumIndex) => `
              <label class="datum-ref">
                <span class="sr-only">${['Primary', 'Secondary', 'Tertiary'][datumIndex]} datum</span>
                <input data-row="${index}" data-datum-index="${datumIndex}" data-datum-prop="letter" value="${escapeHtml(item.letter)}" maxlength="7" placeholder="${['A', 'B', 'C'][datumIndex]}" aria-label="${['Primary', 'Secondary', 'Tertiary'][datumIndex]} datum">
                <select data-row="${index}" data-datum-index="${datumIndex}" data-datum-prop="boundary" aria-label="${['Primary', 'Secondary', 'Tertiary'][datumIndex]} datum boundary">
                  <option value=""${!item.boundary ? ' selected' : ''}>—</option>
                  <option value="Ⓜ"${item.boundary === 'Ⓜ' ? ' selected' : ''}>Ⓜ</option>
                  <option value="Ⓛ"${item.boundary === 'Ⓛ' ? ' selected' : ''}>Ⓛ</option>
                </select>
              </label>`).join('')}
          </div>
        </div>

        <div class="row-warning-slot">${warning.length ? `<p class="row-warning">${escapeHtml(warning[0])}</p>` : ''}</div>
      </div>
    </article>`;
}

function renderEditor() {
  els.modeButtons.forEach((button) => {
    const active = button.dataset.mode === state.mode;
    button.classList.toggle('is-active', active);
    button.setAttribute('aria-pressed', String(active));
  });
  selectedRow = Math.min(selectedRow, state.rows.length - 1);
  els.rowEditors.innerHTML = renderRowEditor(state.rows[selectedRow], selectedRow);
  els.rowActions.hidden = state.mode === 'single';
  const rowType = state.mode === 'composite' ? 'Segment' : 'Row';
  els.editRow.innerHTML = state.rows.map((_, index) =>
    `<option value="${index}">${rowType} ${index + 1} of ${state.rows.length}</option>`
  ).join('');
  els.editRow.value = String(selectedRow);
  $('#remove-row').hidden = state.rows.length <= 2;
  const addAllowed = state.mode !== 'single' && state.rows.length < MAX_ROWS;
  els.addRow.disabled = !addAllowed;
  updateAnnotationEditor();

}

function refreshRowWarnings() {
  state.rows.forEach((frameRow, index) => {
    const slot = $(`[data-row-card="${index}"] .row-warning-slot`);
    if (!slot) return;
    const warning = rowWarning(frameRow, index);
    slot.innerHTML = warning.length ? `<p class="row-warning">${escapeHtml(warning[0])}</p>` : '';
  });

}

// All artwork uses h as its unit, from the supplied Appendix C figures.
// The same vector paths serve the UI and PNG copy.
function symbolGeometry(id) {
  const slant = 1.5 / Math.sqrt(3);
  const arrow = (offset) => {
    const tip = offset + 1.5;
    const back = 0.8 / Math.sqrt(2);
    const half = 0.3 / Math.sqrt(2);
    return `<path d="M${offset} 1.5 L${tip} 0"/><path class="solid" d="M${tip} 0 L${tip - back - half} ${back - half} L${tip - back + half} ${back + half} Z"/>`;
  };
  const geometry = {
    straightness: { width: 2, height: 0, paths: '<path d="M0 0 H2"/>' },
    flatness: { width: 2, height: 1, paths: '<path d="M0 1 L0.5 0 H2 L1.5 1 Z"/>' },
    circularity: { width: 1.5, height: 1.5, paths: '<circle cx="0.75" cy="0.75" r="0.75"/>' },
    cylindricity: { width: 2 / Math.sqrt(3) + slant, height: 1.5, paths: `<circle cx="${(2 / Math.sqrt(3) + slant) / 2}" cy="0.75" r="0.5"/><path d="M0 1.5 L${slant} 0 M${2 / Math.sqrt(3)} 1.5 L${2 / Math.sqrt(3) + slant} 0"/>` },
    'line-profile': { width: 2, height: 1, paths: '<path d="M0 1 A1 1 0 0 1 2 1"/>' },
    'surface-profile': { width: 2, height: 1, paths: '<path d="M0 1 A1 1 0 0 1 2 1 Z"/>' },
    angularity: { width: 1.5, height: Math.sqrt(3) / 2, paths: `<path d="M1.5 0 L0 ${Math.sqrt(3) / 2} H1.5"/>` },
    perpendicularity: { width: 2, height: 1.5, paths: '<path d="M1 0 V1.5 M0 1.5 H2"/>' },
    parallelism: { width: slant + 0.6, height: 1.5, paths: `<path d="M0 1.5 L${slant} 0 M0.6 1.5 L${slant + 0.6} 0"/>` },
    position: { width: 1.5, height: 1.5, paths: '<circle cx="0.75" cy="0.75" r="0.5"/><path d="M0 0.75 H1.5 M0.75 0 V1.5"/>' },
    'circular-runout': { width: 1.5, height: 1.5, paths: arrow(0) },
    'total-runout': { width: 2.6, height: 1.5, paths: arrow(0) + arrow(1.1) + '<path d="M0 1.5 H1.1"/>' }
  };
  return geometry[id] || geometry.position;
}

function symbolArtwork(id, x, y, unit, color = 'currentColor') {
  return `<g transform="translate(${x} ${y}) scale(${unit})" fill="none" stroke="${color}" stroke-width="${2 / 24}" stroke-linecap="round" stroke-linejoin="round">${symbolGeometry(id).paths.replaceAll('class="solid"', `fill="${color}" stroke="none"`)}</g>`;
}

function iconSvg(id, label = '') {
  const geometry = symbolGeometry(id);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 76 48" role="img" aria-label="${escapeHtml(label || SYMBOLS[id].name)}">${symbolArtwork(id, (76 - geometry.width * 24) / 2, (48 - geometry.height * 24) / 2, 24)}</svg>`;
}

function renderInterfaceIcons() {
  $$('[data-symbol-icon]').forEach((element) => {
    const id = element.dataset.symbolIcon;
    if (id === 'diameter') {
      element.innerHTML = '<svg viewBox="0 0 40 40" aria-hidden="true"><circle cx="20" cy="20" r="12" fill="none" stroke="currentColor" stroke-width="2"/><path d="M11 35 L29 5" fill="none" stroke="currentColor" stroke-width="2"/></svg>';
      return;
    }
    const geometry = symbolGeometry(id);
    const unit = 28 / Math.max(geometry.width, geometry.height);
    element.innerHTML = `<svg viewBox="0 0 40 40" aria-hidden="true">${symbolArtwork(id, (40 - geometry.width * unit) / 2, (40 - geometry.height * unit) / 2, unit)}</svg>`;
  });
  $$('[data-modifier-icon]').forEach((element) => {
    const letter = escapeXml(element.dataset.modifierIcon);
    element.innerHTML = `<svg viewBox="0 0 40 40" aria-hidden="true"><circle cx="20" cy="20" r="17" fill="none" stroke="currentColor" stroke-width="2"/><text x="20" y="20" dy=".03em" text-anchor="middle" dominant-baseline="central" font-family="Arial,sans-serif" font-size="24">${letter}</text></svg>`;
  });
}

// Appendix C proportions are expressed from h, the selected letter height.
// CSS font-size is larger than the visible capital height, so a 32 px em
// produces an approximately 24 px drawn capital height with Arial.
const FCF_METRICS = Object.freeze({
  h: 24,
  frameHeight: 48,
  textSize: 32,
  modifierDiameter: 36,
  border: 2,
  dividerClearance: 12
});

const MODIFIER_LETTERS = Object.freeze({ 'Ⓜ': 'M', 'Ⓛ': 'L', 'Ⓢ': 'S', 'Ⓟ': 'P', 'Ⓣ': 'T', 'Ⓕ': 'F', 'Ⓤ': 'U' });
const MODIFIER_GLYPHS = new Set(Object.keys(MODIFIER_LETTERS));

let frameMeasureContext = null;

function measurePlainFrameText(text) {
  if (!frameMeasureContext) frameMeasureContext = document.createElement('canvas').getContext('2d');
  if (!frameMeasureContext) return [...String(text)].length * FCF_METRICS.h * 0.65;
  frameMeasureContext.font = `400 ${FCF_METRICS.textSize}px Arial, sans-serif`;
  return frameMeasureContext.measureText(String(text)).width;
}

function frameTextParts(text) {
  const parts = [];
  [...String(text)].forEach((character) => {
    if (character === '⌀') parts.push({ diameter: true, width: FCF_METRICS.h + 4 });
    else if (MODIFIER_GLYPHS.has(character)) parts.push({ letter: MODIFIER_LETTERS[character], width: FCF_METRICS.modifierDiameter + 4 });
    else if (parts.at(-1)?.text !== undefined) parts.at(-1).text += character;
    else parts.push({ text: character });
  });
  return parts.map((part) => part.text === undefined ? part : { ...part, width: measurePlainFrameText(part.text) });
}

function measureFrameText(text) {
  return frameTextParts(text).reduce((width, part) => width + part.width, 0);
}

function textCellWidth(text, role = 'tolerance') {
  const minimum = role === 'datum' ? 1.5 * FCF_METRICS.h : 2 * FCF_METRICS.h;
  return Math.ceil(Math.max(minimum, Math.min(18 * FCF_METRICS.h, measureFrameText(text) + FCF_METRICS.dividerClearance)));
}

function frameSymbolCellWidth(symbolId) {
  return Math.ceil(symbolGeometry(symbolId).width * FCF_METRICS.h + FCF_METRICS.dividerClearance);
}

function stackedColumnLayout(rows = state.rows) {
  const datumCount = Math.max(...rows.map((frameRow) => activeDatums(frameRow).length));
  return {
    symbolWidth: Math.max(...rows.map((frameRow) => frameSymbolCellWidth(frameRow.symbol))),
    toleranceWidth: Math.max(...rows.map((frameRow) => textCellWidth(toleranceToken(frameRow)))),
    datumWidths: Array.from({ length: datumCount }, (_, index) => Math.max(...rows.map((frameRow) => textCellWidth(activeDatums(frameRow)[index] || '', 'datum'))))
  };
}

function independentRowLayout(frameRow, columns = null) {
  const tokens = activeDatums(frameRow);
  const layout = {
    symbolWidth: columns?.symbolWidth ?? frameSymbolCellWidth(frameRow.symbol),
    toleranceWidth: columns?.toleranceWidth ?? textCellWidth(toleranceToken(frameRow)),
    datums: tokens.map((text, index) => ({ text, width: columns?.datumWidths[index] ?? textCellWidth(text, 'datum') }))
  };
  // Like composite frames, missing datums shorten the row, not widen a cell.
  return layout;
}

function frameTextScale() {
  const cells = state.rows.flatMap((frameRow) => [
    { text: toleranceToken(frameRow), role: 'tolerance' },
    ...activeDatums(frameRow).map((text) => ({ text, role: 'datum' }))
  ]);
  return Math.min(1, ...cells.map(({ text, role }) => (textCellWidth(text, role) - FCF_METRICS.dividerClearance) / Math.max(measureFrameText(text), 1)));
}

function diameterArtwork(centerX, centerY, scale, color) {
  const radius = FCF_METRICS.h * scale / 2;
  const halfHeight = 0.75 * FCF_METRICS.h * scale;
  const halfWidth = halfHeight / Math.sqrt(3);
  return `<g fill="none" stroke="${color}" stroke-width="${FCF_METRICS.border}" stroke-linecap="round"><circle cx="${centerX}" cy="${centerY}" r="${radius}"/><path d="M${centerX - halfWidth} ${centerY + halfHeight} L${centerX + halfWidth} ${centerY - halfHeight}"/></g>`;
}

function drawSymbolCell(x, y, width, height, symbolId, color, fill) {
  const geometry = symbolGeometry(symbolId);
  return `<rect x="${x}" y="${y}" width="${width}" height="${height}" fill="${fill}" stroke="${color}" stroke-width="${FCF_METRICS.border}"/>${symbolArtwork(symbolId, x + (width - geometry.width * FCF_METRICS.h) / 2, y + (height - geometry.height * FCF_METRICS.h) / 2, FCF_METRICS.h, color)}`;
}

function editableToleranceParts(frameRow, rowIndex) {
  const parts = frameTextParts(frameRow.zone === 'diameter' ? '⌀' : '');
  const addValue = (field, label, value) => {
    const text = value.trim() || '—';
    parts.push({ text, width: measurePlainFrameText(text), key: `${rowIndex}:${field}`, label });
  };
  addValue('tolerance', 'Tolerance', frameRow.tolerance);
  parts.push(...frameTextParts(frameRow.material));
  if (frameRow.requirement) {
    parts.push(...frameTextParts(` ${frameRow.requirement}`));
    if (frameRow.requirement === 'Ⓤ' && frameRow.requirementValue.trim()) {
      parts.push(...frameTextParts(' '));
      addValue('requirementValue', 'Unequal offset', frameRow.requirementValue);
    }
  }
  if (frameRow.projected) {
    parts.push(...frameTextParts(' Ⓟ'));
    if (frameRow.projection.trim()) {
      parts.push(...frameTextParts(' '));
      addValue('projection', 'Projection height', frameRow.projection);
    }
  }
  return parts;
}

function drawTextCell(x, y, width, height, text, color, fill, parts = frameTextParts(text)) {
  const totalWidth = parts.reduce((sum, part) => sum + part.width, 0);
  const scale = frameTextScale();
  let cursor = x + (width - totalWidth * scale) / 2;
  const content = parts.map((part) => {
    const centerX = cursor + part.width * scale / 2;
    cursor += part.width * scale;
    if (part.diameter) return diameterArtwork(centerX, y + height / 2, scale, color);
    const label = part.text === undefined ? part.letter : part.text;
    const circle = part.text === undefined ? `<circle cx="${centerX}" cy="${y + height / 2}" r="${FCF_METRICS.modifierDiameter * scale / 2}" fill="none" stroke="${color}" stroke-width="${FCF_METRICS.border}"/>` : '';
    const fontSize = (part.text === undefined ? FCF_METRICS.textSize * 0.8 : FCF_METRICS.textSize) * scale;
    const artwork = `${circle}<text x="${centerX}" y="${y + height / 2}" dy="0.03em" dominant-baseline="central" text-anchor="middle" font-family="Arial,sans-serif" font-size="${fontSize}" font-weight="400" fill="${color}" xml:space="preserve">${escapeXml(label)}</text>`;
    return part.key ? previewNumberButton(artwork, part.key, part.label) : artwork;
  }).join('');
  return `<rect x="${x}" y="${y}" width="${width}" height="${height}" fill="${fill}" stroke="${color}" stroke-width="${FCF_METRICS.border}"/>${content}`;
}

function annotationMetrics(text, type) {
  if (type === 'datum-target') {
    const diameter = 3.5 * FCF_METRICS.h;
    return { width: diameter, height: diameter };
  }
  return {
    width: type === 'datum' ? 2 * FCF_METRICS.h : Math.max(48, Math.min(560, measurePlainFrameText(text) * (type === 'free' ? 27 : 25) / FCF_METRICS.textSize + 12)),
    height: type === 'datum' ? 3.5 * FCF_METRICS.h : 52
  };
}

function datumTargetFontSize(text) {
  const baseSize = 0.8 * FCF_METRICS.textSize;
  if (!text) return baseSize;
  const maximumWidth = 2.5 * FCF_METRICS.h;
  const measuredWidth = measureFrameText(text);
  const size = Math.min(baseSize, FCF_METRICS.textSize * maximumWidth / Math.max(measuredWidth, 1));
  return Math.round(size * 100) / 100;
}

function drawAnnotationSvg(type, text, x, y, width, height, color, fill, placement, interactive = false) {
  if (type === 'free') {
    return `<text x="${x + width / 2}" y="${y + height / 2}" dominant-baseline="central" text-anchor="middle" font-family="Arial,sans-serif" font-size="27" font-weight="400" fill="${color}">${escapeXml(text)}</text>`;
  }
  if (type === 'boxed') {
    return `<rect x="${x}" y="${y}" width="${width}" height="${height}" fill="${fill}" stroke="${color}" stroke-width="${FCF_METRICS.border}"/><text x="${x + width / 2}" y="${y + height / 2}" dominant-baseline="central" text-anchor="middle" font-family="Arial,sans-serif" font-size="25" font-weight="400" fill="${color}">${escapeXml(text)}</text>`;
  }
  if (type === 'datum-target') {
    const centerX = x + width / 2;
    const centerY = y + height / 2;
    const radius = width / 2 - FCF_METRICS.border / 2;
    const targetSize = datumTargetSizeText();
    const upperText = targetSize
      ? `<text x="${centerX}" y="${y + height / 4}" dy="0.03em" dominant-baseline="central" text-anchor="middle" font-family="Arial,sans-serif" font-size="${datumTargetFontSize(targetSize)}" font-weight="400" fill="${color}">${escapeXml(targetSize)}</text>`
      : '';
    const lowerText = `<text x="${centerX}" y="${y + 3 * height / 4}" dy="0.03em" dominant-baseline="central" text-anchor="middle" font-family="Arial,sans-serif" font-size="${datumTargetFontSize(text)}" font-weight="400" fill="${color}">${escapeXml(text)}</text>`;
    return `<circle cx="${centerX}" cy="${centerY}" r="${radius}" fill="${fill}" stroke="${color}" stroke-width="${FCF_METRICS.border}"/><line x1="${x + FCF_METRICS.border / 2}" y1="${centerY}" x2="${x + width - FCF_METRICS.border / 2}" y2="${centerY}" stroke="${color}" stroke-width="${FCF_METRICS.border}"/>${interactive && upperText ? previewNumberButton(upperText, 'target', 'Edit datum target size') : upperText}${lowerText}`;
  }
  const boxHeight = 2 * FCF_METRICS.h;
  const triangleHeight = FCF_METRICS.h;
  const triangleHalfBase = FCF_METRICS.h / Math.sqrt(3);
  const leaderLength = 0.5 * FCF_METRICS.h;
  const center = x + width / 2;
  if (placement === 'above') {
    const apexY = y + boxHeight + leaderLength;
    const baseY = apexY + triangleHeight;
    return `<rect x="${x}" y="${y}" width="${width}" height="${boxHeight}" fill="${fill}" stroke="${color}" stroke-width="${FCF_METRICS.border}"/><text x="${center}" y="${y + boxHeight / 2}" dy="0.03em" dominant-baseline="central" text-anchor="middle" font-family="Segoe UI, Arial, sans-serif" font-size="${FCF_METRICS.textSize}" font-weight="400" fill="${color}">${escapeXml(text)}</text><line x1="${center}" y1="${y + boxHeight}" x2="${center}" y2="${apexY}" stroke="${color}" stroke-width="${FCF_METRICS.border}"/><path d="M ${center} ${apexY} L ${center - triangleHalfBase} ${baseY} L ${center + triangleHalfBase} ${baseY} Z" fill="${color}"/>`;
  }
  const apexY = y + triangleHeight;
  const boxY = apexY + leaderLength;
  return `<path d="M ${center - triangleHalfBase} ${y} L ${center + triangleHalfBase} ${y} L ${center} ${apexY} Z" fill="${color}"/><line x1="${center}" y1="${apexY}" x2="${center}" y2="${boxY}" stroke="${color}" stroke-width="${FCF_METRICS.border}"/><rect x="${x}" y="${boxY}" width="${width}" height="${boxHeight}" fill="${fill}" stroke="${color}" stroke-width="${FCF_METRICS.border}"/><text x="${center}" y="${boxY + boxHeight / 2}" dy="0.03em" dominant-baseline="central" text-anchor="middle" font-family="Segoe UI, Arial, sans-serif" font-size="${FCF_METRICS.textSize}" font-weight="400" fill="${color}">${escapeXml(text)}</text>`;
}

function previewNumberButton(content, key, label) {
  return `<g data-preview-number="${key}" role="button" tabindex="0" aria-label="${escapeXml(label)}">${content}</g>`;
}

function buildFrameSvg(interactive = false) {
  const cellHeight = FCF_METRICS.frameHeight;
  const gap = 0;
  const pad = FCF_METRICS.border / 2;
  const solidBlack = state.fillPreset === 'oth';
  const color = solidBlack ? '#ffffff' : '#000000';
  const cellFill = FRAME_FILLS[state.fillPreset] ?? state.color;
  const annotationFill = state.transparent ? 'none' : '#ffffff';
  let content = '';
  let maxRight = 0;
  let maxBottom = 0;

  if (isAnnotationOnly()) {
    const text = annotationText();
    const metrics = annotationMetrics(text, state.annotation.type);
    const edgePad = ['boxed', 'datum'].includes(state.annotation.type) ? FCF_METRICS.border / 2 : 0;
    const width = metrics.width + edgePad * 2;
    const height = metrics.height + edgePad * 2;
    const annotationContent = drawAnnotationSvg(state.annotation.type, text, edgePad, edgePad, metrics.width, metrics.height, '#000000', annotationFill, state.annotation.placement, interactive);
    const background = state.transparent ? '' : `<rect width="${width}" height="${height}" fill="#fff"/>`;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="${interactive ? 'group' : 'img'}" aria-labelledby="frame-title"><title id="frame-title">${escapeXml(frameDescription())}</title>${background}${annotationContent}</svg>`;
    return { svg, width, height };
  }

  if (state.mode === 'composite') {
    const symbolWidth = frameSymbolCellWidth(state.rows[0].symbol);
    const toleranceWidth = Math.max(...state.rows.map((frameRow) => textCellWidth(toleranceToken(frameRow))));
    const maximumDatumCount = Math.max(...state.rows.map((frameRow) => activeDatums(frameRow).length));
    const datumWidths = Array.from({ length: maximumDatumCount }, (_, datumIndex) => Math.max(
      ...state.rows.map((frameRow) => textCellWidth(activeDatums(frameRow)[datumIndex] || '', 'datum'))
    ));
    content += drawSymbolCell(pad, pad, symbolWidth, cellHeight * state.rows.length, state.rows[0].symbol, color, cellFill);
    state.rows.forEach((frameRow, rowIndex) => {
      const y = pad + rowIndex * cellHeight;
      let x = pad + symbolWidth;
      const tolerance = toleranceToken(frameRow);
      const parts = interactive ? editableToleranceParts(frameRow, rowIndex) : undefined;
      content += drawTextCell(x, y, toleranceWidth, cellHeight, tolerance, color, cellFill, parts);
      x += toleranceWidth;
      activeDatums(frameRow).forEach((token, datumIndex) => {
        const width = datumWidths[datumIndex];
        content += drawTextCell(x, y, width, cellHeight, token, color, cellFill);
        x += width;
      });
      maxRight = Math.max(maxRight, x);
    });
    maxBottom = pad + cellHeight * state.rows.length;
  } else {
    const columns = state.mode === 'stacked' ? stackedColumnLayout() : null;
    state.rows.forEach((frameRow, rowIndex) => {
      const y = pad + rowIndex * (cellHeight + gap);
      const layout = independentRowLayout(frameRow, columns);
      const symbolWidth = layout.symbolWidth;
      let x = pad;
      content += drawSymbolCell(x, y, symbolWidth, cellHeight, frameRow.symbol, color, cellFill);
      x += symbolWidth;
      const tolerance = toleranceToken(frameRow);
      const toleranceWidth = layout.toleranceWidth;
      const parts = interactive ? editableToleranceParts(frameRow, rowIndex) : undefined;
      content += drawTextCell(x, y, toleranceWidth, cellHeight, tolerance, color, cellFill, parts);
      x += toleranceWidth;
      layout.datums.forEach(({ text, width }) => {
        content += drawTextCell(x, y, width, cellHeight, text, color, cellFill);
        x += width;
      });
      maxRight = Math.max(maxRight, x);
      maxBottom = Math.max(maxBottom, y + cellHeight);
    });
  }

  const frameWidth = maxRight + pad;
  const frameHeight = maxBottom + pad;
  let width = frameWidth;
  let height = frameHeight;
  let frameOffsetX = 0;
  let frameOffsetY = 0;
  let annotationContent = '';

  if (hasAnnotation()) {
    const text = annotationText();
    const metrics = annotationMetrics(text, state.annotation.type);
    const gap = state.annotation.type === 'datum' ? 0 : 18;
    width = Math.max(frameWidth, metrics.width + pad * 2);
    frameOffsetX = (width - frameWidth) / 2;
    if (state.annotation.placement === 'above') {
      frameOffsetY = metrics.height + gap;
      height = frameHeight + frameOffsetY;
      annotationContent = drawAnnotationSvg(state.annotation.type, text, (width - metrics.width) / 2, 0, metrics.width, metrics.height, '#000000', annotationFill, 'above', interactive);
    } else {
      height = frameHeight + gap + metrics.height;
      annotationContent = drawAnnotationSvg(state.annotation.type, text, (width - metrics.width) / 2, frameHeight + gap, metrics.width, metrics.height, '#000000', annotationFill, 'below', interactive);
    }
  }

  const background = state.transparent ? '' : `<rect width="${width}" height="${height}" fill="#fff"/>`;
  const frameContent = frameOffsetX || frameOffsetY ? `<g transform="translate(${frameOffsetX} ${frameOffsetY})">${content}</g>` : content;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="${interactive ? 'group' : 'img'}" aria-labelledby="frame-title"><title id="frame-title">${escapeXml(frameDescription())}</title>${background}${frameContent}${annotationContent}</svg>`;
  return { svg, width, height };
}

function frameDescription() {
  const annotationName = state.annotation.type === 'datum-target' ? 'Datum target' : state.annotation.type === 'datum' ? 'Datum' : state.annotation.type === 'boxed' ? 'Boxed note' : 'Note';
  if (isAnnotationOnly()) return `${annotationName}: ${annotationSummaryText() || '—'} · annotation only`;
  const annotation = hasAnnotation() ? ` · ${annotationName}: ${annotationSummaryText()}` : '';
  if (state.mode === 'composite') {
    return `Composite ${SYMBOLS[state.rows[0].symbol].name}: ${state.rows.map((frameRow) => `${toleranceToken(frameRow)}${activeDatums(frameRow).length ? ` · ${activeDatums(frameRow).join(' | ')}` : ''}`).join(' / ')}${annotation}`;
  }
  return `${state.rows.map((frameRow) => `${SYMBOLS[frameRow.symbol].name} · ${toleranceToken(frameRow)}${activeDatums(frameRow).length ? ` · ${activeDatums(frameRow).join(' | ')}` : ''}`).join(' / ')}${annotation}`;
}

function renderPreview() {
  latestSvg = buildFrameSvg(true);
  els.preview.innerHTML = latestSvg.svg;
  const svgElement = $('svg', els.preview);
  const board = $('#drawing-board');
  const maxPreviewHeight = Math.min(104, Math.max(62, window.innerHeight * 0.14));
  const scale = board.clientWidth
    ? Math.min(1, Math.max(1, board.clientWidth - 20) / latestSvg.width, maxPreviewHeight / latestSvg.height)
    : 1;
  svgElement.style.width = `${latestSvg.width * scale}px`;
  svgElement.style.height = `${latestSvg.height * scale}px`;




  els.transparent.checked = state.transparent;
  els.color.value = state.color;
  $$('[data-preset]').forEach((button) => {
    const active = button.dataset.preset === state.fillPreset;
    button.classList.toggle('is-active', active);
    button.setAttribute('aria-pressed', String(active));
  });
  els.color.closest('.custom-color').classList.toggle('is-active', state.fillPreset === 'custom');
}

function showToast(message, isError = false) {
  clearTimeout(toastTimer);
  els.toast.textContent = message;
  els.toast.classList.toggle('is-error', isError);
  toastTimer = setTimeout(() => { els.toast.textContent = ''; els.toast.classList.remove('is-error'); }, 6000);
}

function setMode(mode) {
  if (!['single', 'composite', 'stacked'].includes(mode)) return;
  if (mode === 'single') {
    state.rows = [state.rows[0]];
  } else if (mode === 'composite') {
    if (!SYMBOLS[state.rows[0].symbol].composite) state.rows[0].symbol = 'position';
    if (state.rows.length < 2) {
      state.rows.push(row({
        symbol: state.rows[0].symbol,
        zone: state.rows[0].zone,
        tolerance: '0.2',
        material: state.rows[0].material,
        projected: state.rows[0].projected,
        projection: state.rows[0].projection,
        datums: [datum('A'), datum('B'), datum('')]
      }));
    }
    state.rows.forEach((frameRow) => { frameRow.symbol = state.rows[0].symbol; });
  } else if (mode === 'stacked' && state.rows.length < 2) {
    state.rows.push(row({ symbol: 'perpendicularity', tolerance: '0.2', material: '', datums: [datum('A'), datum(''), datum('')] }));
  }
  state.mode = mode;
  selectedRow = 0;
  renderEditor();
  renderPreview();
}

function addRow() {
  if (state.mode === 'single' || state.rows.length >= MAX_ROWS) return;
  const upper = state.rows[0];
  state.rows.push(state.mode === 'composite'
    ? row({
      symbol: upper.symbol,
      zone: upper.zone,
      tolerance: formatInputNumber(Math.max(0, (Number(upper.tolerance) || 0.4) / (state.rows.length + 1))),
      material: upper.material,
      projected: upper.projected,
      projection: upper.projection,
      datums: [datum('A'), datum(''), datum('')]
    })
    : row({ symbol: 'parallelism', zone: 'none', tolerance: '0.1', material: '', datums: [datum('A'), datum(''), datum('')] }));
  selectedRow = state.rows.length - 1;
  renderEditor();
  renderPreview();
}

function loadTemplate(name) {
  const templates = {
    position: { mode: 'single', rows: [row({ symbol: 'position', zone: 'diameter', tolerance: '0.25', material: 'Ⓜ' })] },
    composite: { mode: 'composite', rows: [
      row({ symbol: 'position', zone: 'diameter', tolerance: '0.5', material: 'Ⓜ' }),
      row({ symbol: 'position', zone: 'diameter', tolerance: '0.2', material: 'Ⓜ', datums: [datum('A'), datum('B'), datum('')] })
    ] },
    stacked: { mode: 'stacked', rows: [
      row({ symbol: 'position', zone: 'diameter', tolerance: '0.5', material: '', datums: [datum('A'), datum('B'), datum('')] }),
      row({ symbol: 'perpendicularity', zone: 'diameter', tolerance: '0.2', material: '', datums: [datum('A'), datum(''), datum('')] })
    ] },
    profile: { mode: 'single', rows: [row({ symbol: 'surface-profile', zone: 'none', tolerance: '1.0' })] },
    flatness: { mode: 'single', rows: [row({ symbol: 'flatness', zone: 'none', tolerance: '0.05', datums: [datum(''), datum(''), datum('')] })] }
  };
  const template = templates[name];
  if (!template) return;
  state.mode = template.mode;
  state.rows = template.rows;
  selectedRow = 0;
  renderEditor();
  renderPreview();
}

async function svgToPngBlob(scale = 4) {
  const frame = buildFrameSvg();
  const blob = new Blob([frame.svg], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  try {
    const image = new Image();
    image.decoding = 'async';
    image.src = url;
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = frame.width * scale;
    canvas.height = frame.height * scale;
    const context = canvas.getContext('2d');
    if (!state.transparent) {
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, canvas.width, canvas.height);
    }
    context.scale(scale, scale);
    context.drawImage(image, 0, 0, frame.width, frame.height);
    return await new Promise((resolve, reject) => canvas.toBlob((png) => png ? resolve(png) : reject(new Error('PNG generation failed')), 'image/png'));
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function copyPng() {
  try {
    const png = await svgToPngBlob(4);
    if (window.isSecureContext && navigator.clipboard?.write && window.ClipboardItem) {
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': png })]);
      showToast(state.annotation.type === 'datum-target' && hasAnnotation() ? 'Circular datum target copied as a high-resolution PNG.' : 'High-resolution PNG copied with fully closed borders.');
    } else {
      showToast('Image clipboard access is unavailable. Allow clipboard access and use HTTPS or localhost, then try again.', true);
    }
  } catch (error) {
    showToast('The browser blocked image copying. Allow clipboard access, then try again.', true);
  }
}

function convertUnits(nextUnits) {
  if (nextUnits === state.units) return;
  const factor = state.units === 'mm' && nextUnits === 'in' ? 1 / 25.4 : 25.4;
  state.rows.forEach((frameRow) => {
    if (frameRow.tolerance.trim() && Number.isFinite(Number(frameRow.tolerance))) frameRow.tolerance = formatNumber(Number(frameRow.tolerance) * factor, nextUnits === 'mm' ? 4 : 5);
    if (frameRow.projection.trim() && Number.isFinite(Number(frameRow.projection))) frameRow.projection = formatNumber(Number(frameRow.projection) * factor, nextUnits === 'mm' ? 4 : 5);
    if (frameRow.requirementValue.trim() && Number.isFinite(Number(frameRow.requirementValue))) frameRow.requirementValue = formatNumber(Number(frameRow.requirementValue) * factor, nextUnits === 'mm' ? 4 : 5);
  });
  if (cleanTargetSize(state.annotation.targetSize) && Number.isFinite(Number(state.annotation.targetSize))) {
    state.annotation.targetSize = formatNumber(Number(state.annotation.targetSize) * factor, nextUnits === 'mm' ? 4 : 5);
  }
  state.units = nextUnits;
  $$('[data-unit]').forEach((element) => { element.textContent = nextUnits; });
  renderEditor();
  renderPreview();
}

els.modeButtons.forEach((button) => button.addEventListener('click', () => setMode(button.dataset.mode)));
els.addRow.addEventListener('click', addRow);
$('#reset-frame').addEventListener('click', () => {
  state = initialState();
  selectedRow = 0;
  els.units.value = state.units;
  $$('[data-unit]').forEach((element) => { element.textContent = state.units; });
  renderEditor();
  renderPreview();
});
$('#template-picker').addEventListener('change', ({ target }) => {
  loadTemplate(target.value);
  target.value = '';
});
els.editRow.addEventListener('change', ({ target }) => {
  selectedRow = Number(target.value);
  renderEditor();
  els.editRow.focus();
});

els.annotationType.addEventListener('change', () => {
  state.annotation.type = els.annotationType.value;
  if (state.annotation.type === 'datum-target' && !VALID_DATUM_TARGET.test(annotationText())) state.annotation.text = 'A1';
  if (state.annotation.type === 'datum' && !VALID_DATUM.test(annotationText())) state.annotation.text = 'A';
  if (state.annotation.type === 'boxed' && !cleanShortText(state.annotation.text)) state.annotation.text = 'BASIC DIMENSION';
  if (state.annotation.type === 'free' && !cleanShortText(state.annotation.text)) state.annotation.text = 'DRAWING NOTE';
  if (state.annotation.type === 'none') state.annotation.only = false;
  updateAnnotationEditor();
  renderPreview();
});
els.annotationText.addEventListener('input', () => {
  const datumLike = ['datum', 'datum-target'].includes(state.annotation.type);
  state.annotation.text = cleanShortText(els.annotationText.value, datumLike ? 7 : 60);
  if (datumLike) {
    state.annotation.text = state.annotation.text.toUpperCase();
    els.annotationText.value = state.annotation.text;

  }
  renderPreview();
});
els.annotationTargetSize.addEventListener('input', () => {
  state.annotation.targetSize = cleanTargetSize(els.annotationTargetSize.value);
  els.annotationTargetSize.value = state.annotation.targetSize;
  renderPreview();
});
els.annotationTargetPrefix.addEventListener('change', () => {
  state.annotation.targetDiameter = els.annotationTargetPrefix.value === 'diameter';
  renderPreview();
});
els.annotationPlacement.addEventListener('change', () => {
  state.annotation.placement = els.annotationPlacement.value;
  renderPreview();
});
els.annotationOnly.addEventListener('change', () => {
  state.annotation.only = els.annotationOnly.checked && state.annotation.type !== 'none';
  updateAnnotationEditor();
  renderPreview();
});

els.rowEditors.addEventListener('input', (event) => {
  const target = event.target;
  const rowIndex = Number(target.dataset.row);
  if (!Number.isInteger(rowIndex) || !state.rows[rowIndex]) return;
  const frameRow = state.rows[rowIndex];
  if (target.dataset.datumIndex !== undefined) {
    const datumIndex = Number(target.dataset.datumIndex);
    frameRow.datums[datumIndex][target.dataset.datumProp] = target.dataset.datumProp === 'letter' ? target.value.toUpperCase() : target.value;
    renderPreview();
    refreshRowWarnings();
    return;
  }
  const field = target.dataset.field;
  if (!field) return;
  frameRow[field] = target.type === 'checkbox' ? target.checked : target.value;
  if (field === 'symbol' && state.mode === 'composite') state.rows.forEach((item) => { item.symbol = frameRow.symbol; });
  const requiresEditorRefresh = ['symbol', 'projected', 'requirement'].includes(field);
  if (requiresEditorRefresh) renderEditor(); else refreshRowWarnings();
  renderPreview();
});

$('#remove-row').addEventListener('click', () => {
  if (state.rows.length <= 2) return;
  state.rows.splice(selectedRow, 1);
  renderEditor();
  renderPreview();
  els.editRow.focus();
});

$$('[data-preset]').forEach((button) => {
  const preset = button.dataset.preset;
  button.style.setProperty('--swatch', FRAME_FILLS[preset]);
  button.addEventListener('click', () => {
    state.fillPreset = preset;
    renderPreview();
  });
});
els.color.addEventListener('click', () => {
  state.fillPreset = 'custom';
  renderPreview();
});
els.color.addEventListener('input', () => {
  state.color = cleanColor(els.color.value);
  state.fillPreset = 'custom';
  renderPreview();
});

els.transparent.addEventListener('change', () => { state.transparent = els.transparent.checked; renderPreview(); });
els.units.addEventListener('change', () => convertUnits(els.units.value));

$('#copy-png').addEventListener('click', copyPng);



const sharedFrameParameter = new URL(location.href).searchParams.get('frame');
const sharedFrameState = decodeSharedState(sharedFrameParameter);
if (sharedFrameState) state = sharedFrameState;
els.units.value = state.units;
$$('[data-unit]').forEach((element) => { element.textContent = state.units; });

renderInterfaceIcons();
renderEditor();
renderPreview();


if (sharedFrameParameter) {
  showToast(sharedFrameState ? 'Shared frame setup loaded.' : 'This share link is invalid, so the sample frame was loaded instead.', !sharedFrameState);
}

let activePreviewInput;
let finishPreviewInput;

function openPreviewNumber(key) {
  finishPreviewInput?.();
  const button = $(`[data-preview-number="${key}"]`, els.preview);
  if (!button) return;

  const [rowIndex, field] = key.split(':');
  const frameRow = state.rows[Number(rowIndex)];
  const input = document.createElement('input');
  input.className = 'preview-number-input';
  input.inputMode = 'decimal';
  input.setAttribute('aria-label', button.getAttribute('aria-label'));
  input.value = key === 'target' ? state.annotation.targetSize : frameRow[field];

  const bounds = button.getBoundingClientRect();
  const previewBounds = els.preview.getBoundingClientRect();
  input.style.left = `${bounds.left - previewBounds.left + bounds.width / 2}px`;
  input.style.top = `${bounds.top - previewBounds.top + bounds.height / 2}px`;
  input.style.width = `${Math.max(46, bounds.width + 12)}px`;
  els.preview.append(input);
  activePreviewInput = input;

  finishPreviewInput = (save = true, restoreFocus = false) => {
    finishPreviewInput = undefined;
    activePreviewInput = undefined;
    input.remove();
    if (save) {
      if (key === 'target') {
        state.annotation.targetSize = cleanTargetSize(input.value);
        els.annotationTargetSize.value = state.annotation.targetSize;
      } else {
        frameRow[field] = input.value.trim();
        const fieldInput = $(`[data-row="${rowIndex}"][data-field="${field}"]`, els.rowEditors);
        if (fieldInput) fieldInput.value = frameRow[field];
        refreshRowWarnings();
      }
    }
    renderPreview();
    if (restoreFocus) $(`[data-preview-number="${key}"]`, els.preview)?.focus({ preventScroll: true });
  };

  input.addEventListener('blur', () => finishPreviewInput?.());
  input.addEventListener('keydown', (event) => {
    if (event.isComposing || !['Enter', 'Escape'].includes(event.key)) return;
    event.preventDefault();
    finishPreviewInput(event.key === 'Enter', true);
  });
  input.focus({ preventScroll: true });
  input.select();
}

els.preview.addEventListener('pointerdown', (event) => {
  const button = event.target.closest('[data-preview-number]');
  if (!button || event.button !== 0) return;
  event.preventDefault();
  openPreviewNumber(button.dataset.previewNumber);
});
els.preview.addEventListener('keydown', (event) => {
  const button = event.target.closest('[data-preview-number]');
  if (!button || !['Enter', ' '].includes(event.key)) return;
  event.preventDefault();
  openPreviewNumber(button.dataset.previewNumber);
});
window.addEventListener('resize', () => {
  if (!activePreviewInput) renderPreview();
});
