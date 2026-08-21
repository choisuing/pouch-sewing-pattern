// SPDX-License-Identifier: MIT
// Copyright (C) 2026 choisuing

import { PRESETS, SEAM_MM, type Preset } from './core/constants';
import { patternFileName, validateDimensions } from './core/dimensions';
import { buildLayout, halveOnFold } from './core/layout';
import { paginate, type PaperSize } from './core/tiling';
import {
  readInputs,
  renderInputs,
  renderFoldOption,
  renderSeamOption,
  renderPaperOptions,
  renderPresetButtons,
  setPaperCount,
  writeInputs,
  writeInputValues,
} from './ui/form';
import { describePagination, legendItems, renderPreviewSvg } from './ui/preview';
import { renderShapeSvg } from './ui/shape';
import { trackDownload } from './track';
import { isStaleChunkError, keepState, takeState } from './stale';
import './style.css';

const PAGE_WARN_THRESHOLD = 20;

const presetsEl = document.getElementById('presets')!;
const inputsEl = document.getElementById('inputs')!;
const papersEl = document.getElementById('papers')!;
const foldFieldEl = document.getElementById('fold-field')!;
const seamFieldEl = document.getElementById('seam-field')!;
const legendEl = document.getElementById('legend')!;
const previewEl = document.getElementById('preview')!;
const shapeEl = document.getElementById('shape')!;
const summaryEl = document.getElementById('preview-summary')!;
const errorEl = document.getElementById('error')!;
const downloadBtn = document.getElementById('download') as HTMLButtonElement;

/*
 * 배포가 지나가 스스로 다시 부른 화면이면 맡겨 둔 상태가 남아 있다.
 * 선언보다 먼저 꺼내야 아래 초기값과 첫 그리기가 한 번에 맞는다.
 */
const kept = takeState();

let paper: PaperSize = kept?.paper ?? 'a4';
let foldHalf = kept?.foldHalf ?? false;
// 기본은 시접 포함. 무심코 시접 없는 도안을 뽑아 원단을 버리는 일을 막는다.
let addSeam = kept?.addSeam ?? true;

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
    legendEl.innerHTML = '';
    downloadBtn.disabled = true;
    setPaperCount('a4', null);
    setPaperCount('a3', null);
    return;
  }

  showError([]);
  shapeEl.innerHTML = renderShapeSvg(result.value);

  const full = buildLayout(result.value, addSeam ? SEAM_MM : 0);
  const layout = foldHalf ? halveOnFold(full) : full;

  // 용지별 장수를 둘 다 보여줘야 해서 어차피 A4·A3을 모두 계산한다.
  // 고른 용지 것을 여기서 꺼내 쓰면 같은 계산을 한 번 덜 한다.
  const byPaper = { a4: paginate(layout, 'a4'), a3: paginate(layout, 'a3') };
  const pagination = byPaper[paper];

  previewEl.innerHTML = renderPreviewSvg(layout, pagination);
  summaryEl.textContent = describePagination(pagination);
  downloadBtn.disabled = false;

  // 견본 색은 CSS가 아니라 legendItems가 준다. 도면에 그린 색과 같은
  // 출처라 범례가 딴 색을 가리킬 수 없다.
  legendEl.innerHTML = legendItems(layout)
    .map((item) => {
      const style = item.fill === undefined
        ? `border-top-color: ${item.color}`
        : `border-color: ${item.color}; background: ${item.fill}`;
      return `<li><span class="swatch ${item.swatch}" style="${style}"></span>${item.text}</li>`;
    })
    .join('');

  setPaperCount('a4', byPaper.a4.pages.length);
  setPaperCount('a3', byPaper.a3.pages.length);
}

/** 새로 부르기 전에 맡길 화면 상태. 사람이 고르고 친 것만 모은다. */
function currentState() {
  const values = readInputs();
  return {
    widthMm: String(values.widthMm ?? ''),
    heightMm: String(values.heightMm ?? ''),
    depthMm: String(values.depthMm ?? ''),
    paper,
    addSeam,
    foldHalf,
  };
}

async function download(): Promise<void> {
  const result = validateDimensions(readInputs());
  if (!result.ok) return;

  const full = buildLayout(result.value, addSeam ? SEAM_MM : 0);
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
    link.href = url;
    link.download = patternFileName(result.value, paper, foldHalf, layout.seamMm);
    link.click();
    // click() 직후 바로 거두면 브라우저가 아직 읽는 중일 수 있다. Chrome은
    // 견디지만 표준이 보장하는 동작은 아니다. 다음 차례로 미뤄 둔다.
    setTimeout(() => URL.revokeObjectURL(url), 1000);

    // 파일이 실제로 나간 뒤에만 센다. 만들다 실패한 시도까지 세면
    // "몇 명이 받았나"가 아니라 "몇 번 눌렀나"가 된다.
    trackDownload({
      ...result.value,
      paper,
      seamMm: layout.seamMm,
      foldHalf,
    });
  } catch (error) {
    /*
     * 배포가 지나가 PDF 조각을 못 찾는 경우다. 화면을 새로 부르면 새 이름을
     * 부르게 되어 저절로 낫는다. 치던 치수는 맡겼다가 되돌려준다.
     *
     * keepState가 거절하면 이미 한 번 다시 불러 본 뒤다. 또 부르면 끝없이
     * 도는 화면이 되므로, 그때는 아래로 내려가 오류를 보여 준다.
     */
    if (isStaleChunkError(error) && keepState(currentState())) {
      showError(['새 버전이 올라왔습니다. 화면을 다시 불러옵니다…']);
      location.reload();
      return;
    }
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
renderSeamOption(seamFieldEl, addSeam, (next) => {
  addSeam = next;
  refresh();
});
renderFoldOption(foldFieldEl, foldHalf, (next) => {
  foldHalf = next;
  refresh();
});
renderPaperOptions(papersEl, paper, (next) => {
  paper = next;
  refresh();
});
downloadBtn.addEventListener('click', () => void download());

// 첫 화면은 첫 번째 프리셋으로 채운다. 되살린 화면이면 치던 값을 되돌린다.
if (kept === undefined) writeInputs(PRESETS[0]!);
else writeInputValues(kept);
refresh();
