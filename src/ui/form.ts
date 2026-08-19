// SPDX-License-Identifier: MIT
// Copyright (C) 2026 choisuing

import {
  DIMENSION_ORDER,
  FIELD_LABELS,
  PRESETS,
  RANGES,
  type DimensionField,
  type Preset,
} from '../core/constants';

/** 프리셋 버튼에 적을 문구. 치수는 DIMENSION_ORDER 순으로 늘어놓는다. */
export function formatPresetLabel(preset: Preset): string {
  const sizes = DIMENSION_ORDER.map((field) => preset[field]).join('*');
  return `${preset.label} ${sizes}`;
}
import type { PaperSize } from '../core/tiling';

export function renderPresetButtons(container: HTMLElement, onPick: (preset: Preset) => void): void {
  container.innerHTML = '';
  PRESETS.forEach((preset, index) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `preset preset-${index + 1}`;
    button.textContent = formatPresetLabel(preset);
    button.addEventListener('click', () => onPick(preset));
    container.append(button);
  });
}

export function renderInputs(container: HTMLElement, onChange: () => void): void {
  container.innerHTML = '';
  for (const field of DIMENSION_ORDER) {
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
    hint.textContent = `최소 ${min} ~ 최대 ${max}`;

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
  for (const field of DIMENSION_ORDER) {
    const input = document.getElementById(`field-${field}`) as HTMLInputElement | null;
    values[field] = input?.value ?? '';
  }
  return values;
}

export function writeInputs(preset: Preset): void {
  for (const field of DIMENSION_ORDER) {
    const input = document.getElementById(`field-${field}`) as HTMLInputElement | null;
    if (input) input.value = String(preset[field]);
  }
}

export function setPaperCount(paper: PaperSize, sheets: number | null): void {
  const el = document.getElementById(`paper-count-${paper}`);
  if (el) el.textContent = sheets === null ? '' : ` · ${sheets}장`;
}

/**
 * 출력 방식 체크박스 하나. 골선접기와 시접 추가가 같은 모양을 쓴다.
 * 둘 다 "도안을 어떻게 뽑을지" 정하는 것이라 나란히 놓인다.
 */
function renderCheckbox(
  container: HTMLElement,
  id: string,
  labelText: string,
  checked: boolean,
  onChange: (next: boolean) => void,
): void {
  container.innerHTML = '';

  const label = document.createElement('label');
  label.className = 'fold-option';

  const box = document.createElement('input');
  box.type = 'checkbox';
  box.id = id;
  box.checked = checked;
  box.addEventListener('change', () => onChange(box.checked));

  const text = document.createElement('span');
  text.textContent = labelText;

  label.append(box, text);
  container.append(label);
}

/**
 * 골선접기. 켜면 전개도의 위쪽 절반만 내보내 인쇄 장수가 대략 반으로 준다.
 * 원단을 접어 그 변에 대고 재단하면 펼쳤을 때 온전한 한 장이 된다.
 */
export function renderFoldOption(
  container: HTMLElement,
  checked: boolean,
  onChange: (next: boolean) => void,
): void {
  renderCheckbox(container, 'fold-half', '골선접기', checked, onChange);
}

/**
 * 시접 추가. 끄면 완성 치수 그대로 뜬다. 재단하면서 손으로 시접을 더하거나
 * 완성선을 따라 그릴 도안이 필요할 때 쓴다. 기본은 켜짐 — 무심코 시접 없는
 * 도안을 뽑아 원단을 버리는 일을 막는다.
 */
export function renderSeamOption(
  container: HTMLElement,
  checked: boolean,
  onChange: (next: boolean) => void,
): void {
  renderCheckbox(container, 'seam-add', '시접 추가', checked, onChange);
}
