import { FIELD_LABELS, PRESETS, RANGES, type DimensionField, type Preset } from '../core/constants';
import type { PaperSize } from '../core/tiling';

const FIELDS: readonly DimensionField[] = ['widthMm', 'depthMm', 'heightMm'];

export function renderPresetButtons(container: HTMLElement, onPick: (preset: Preset) => void): void {
  container.innerHTML = '';
  for (const preset of PRESETS) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'preset';
    button.textContent = `${preset.label} ${preset.widthMm}×${preset.depthMm}×${preset.heightMm}`;
    button.addEventListener('click', () => onPick(preset));
    container.append(button);
  }
}

export function renderInputs(container: HTMLElement, onChange: () => void): void {
  container.innerHTML = '';
  for (const field of FIELDS) {
    const { min, max } = RANGES[field];
    const wrapper = document.createElement('label');
    wrapper.className = 'input-row';

    const name = document.createElement('span');
    name.className = 'input-name';
    name.textContent = FIELD_LABELS[field];

    const input = document.createElement('input');
    input.type = 'number';
    input.id = `field-${field}`;
    input.min = String(min);
    input.max = String(max);
    input.step = '1';
    input.inputMode = 'numeric';
    input.addEventListener('input', onChange);

    const hint = document.createElement('span');
    hint.className = 'input-hint';
    hint.textContent = `${min}~${max}mm`;

    wrapper.append(name, input, hint);
    container.append(wrapper);
  }
}

export function renderPaperOptions(
  container: HTMLElement,
  selected: PaperSize,
  onChange: (paper: PaperSize) => void,
): void {
  container.innerHTML = '';
  for (const paper of ['a4', 'a3'] as const) {
    const label = document.createElement('label');
    label.className = 'paper-option';

    const radio = document.createElement('input');
    radio.type = 'radio';
    radio.name = 'paper';
    radio.value = paper;
    radio.checked = paper === selected;
    radio.addEventListener('change', () => onChange(paper));

    const text = document.createElement('span');
    text.textContent = paper.toUpperCase();

    const count = document.createElement('span');
    count.className = 'paper-count';
    count.id = `paper-count-${paper}`;

    label.append(radio, text, count);
    container.append(label);
  }
}

export function readInputs(): Record<DimensionField, unknown> {
  const values = {} as Record<DimensionField, unknown>;
  for (const field of FIELDS) {
    const input = document.getElementById(`field-${field}`) as HTMLInputElement | null;
    values[field] = input?.value ?? '';
  }
  return values;
}

export function writeInputs(preset: Preset): void {
  for (const field of FIELDS) {
    const input = document.getElementById(`field-${field}`) as HTMLInputElement | null;
    if (input) input.value = String(preset[field]);
  }
}

export function setPaperCount(paper: PaperSize, sheets: number | null): void {
  const el = document.getElementById(`paper-count-${paper}`);
  if (el) el.textContent = sheets === null ? '' : ` · ${sheets}장`;
}
