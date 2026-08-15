// SPDX-License-Identifier: MIT
// Copyright (C) 2026 choisuing

import { PRESETS, type Preset } from './core/constants';
import { validateDimensions } from './core/dimensions';
import { buildLayout, halveOnFold } from './core/layout';
import { paginate, type PaperSize } from './core/tiling';
import {
  readInputs,
  renderInputs,
  renderFoldOption,
  renderPaperOptions,
  renderPresetButtons,
  setPaperCount,
  writeInputs,
} from './ui/form';
import { describePagination, renderPreviewSvg } from './ui/preview';
import { renderShapeSvg } from './ui/shape';
import './style.css';

const PAGE_WARN_THRESHOLD = 20;

const presetsEl = document.getElementById('presets')!;
const inputsEl = document.getElementById('inputs')!;
const papersEl = document.getElementById('papers')!;
const foldFieldEl = document.getElementById('fold-field')!;
const previewEl = document.getElementById('preview')!;
const shapeEl = document.getElementById('shape')!;
const summaryEl = document.getElementById('preview-summary')!;
const errorEl = document.getElementById('error')!;
const downloadBtn = document.getElementById('download') as HTMLButtonElement;

let paper: PaperSize = 'a4';
let foldHalf = false;

function showError(messages: readonly string[]): void {
  if (messages.length === 0) {
    errorEl.hidden = true;
    errorEl.textContent = '';
    return;
  }
  errorEl.hidden = false;
  errorEl.textContent = messages.join(' ');
}

function refresh(): void {
  const result = validateDimensions(readInputs());

  if (!result.ok) {
    showError(result.errors.map((e) => e.message));
    previewEl.innerHTML = '';
    shapeEl.innerHTML = '';
    summaryEl.textContent = '';
    downloadBtn.disabled = true;
    setPaperCount('a4', null);
    setPaperCount('a3', null);
    return;
  }

  showError([]);
  shapeEl.innerHTML = renderShapeSvg(result.value);

  const full = buildLayout(result.value);
  const layout = foldHalf ? halveOnFold(full) : full;
  const pagination = paginate(layout, paper);
  previewEl.innerHTML = renderPreviewSvg(layout, pagination);
  summaryEl.textContent = describePagination(pagination);
  downloadBtn.disabled = false;

  setPaperCount('a4', paginate(layout, 'a4').pages.length);
  setPaperCount('a3', paginate(layout, 'a3').pages.length);
}

async function download(): Promise<void> {
  const result = validateDimensions(readInputs());
  if (!result.ok) return;

  const full = buildLayout(result.value);
  const layout = foldHalf ? halveOnFold(full) : full;
  const pagination = paginate(layout, paper);

  if (pagination.pages.length > PAGE_WARN_THRESHOLD) {
    const ok = window.confirm(
      `${pagination.pages.length}장이 출력됩니다. 계속할까요?`,
    );
    if (!ok) return;
  }

  downloadBtn.disabled = true;
  try {
    // PDF 생성기는 한글 폰트와 fontkit을 끌고 와 첫 로딩을 무겁게 만든다.
    // 버튼을 누른 뒤에 받아오면 화면은 가볍게 뜨고 기능은 그대로다.
    const { buildPdf } = await import('./core/pdf');
    const bytes = await buildPdf(layout, pagination);
    // TS 5.7+에서 bare Uint8Array는 Uint8Array<ArrayBufferLike>로 추론되어
    // BlobPart(ArrayBufferView<ArrayBuffer>)에 그대로 대입되지 않는다.
    // @types/node를 추가하지 않고(불필요한 의존성) 여기서만 단언으로 좁힌다.
    const blob = new Blob([bytes as BlobPart], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const { widthMm: W, depthMm: D, heightMm: H } = result.value;
    link.href = url;
    link.download = `box-pouch-${W}x${D}x${H}-${paper}${foldHalf ? '-half' : ''}.pdf`;
    link.click();
    URL.revokeObjectURL(url);
  } catch (error) {
    showError([`PDF를 만들지 못했습니다: ${error instanceof Error ? error.message : String(error)}`]);
  } finally {
    downloadBtn.disabled = false;
  }
}

renderPresetButtons(presetsEl, (preset: Preset) => {
  writeInputs(preset);
  refresh();
});
renderInputs(inputsEl, refresh);
renderFoldOption(foldFieldEl, foldHalf, (next) => {
  foldHalf = next;
  refresh();
});
renderPaperOptions(papersEl, paper, (next) => {
  paper = next;
  refresh();
});
downloadBtn.addEventListener('click', () => void download());

// 첫 화면은 첫 번째 프리셋으로 채운다.
writeInputs(PRESETS[0]!);
refresh();
