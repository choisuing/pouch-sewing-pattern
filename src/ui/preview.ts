import type { Layout, Point } from '../core/layout';
import type { Pagination } from '../core/tiling';

export function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * 인쇄 페이지 경계와 칸 번호. 화면 요약줄(--info)과 같은 청록 계열이라
 * "페이지"라는 개념이 한 색으로 묶인다. 회색으로 두면 접힘선과 헷갈린다.
 * 배경 #fbf7f0 위에서 5.04:1 — 선(3:1)과 글자(4.5:1) 기준을 모두 넘는다.
 */
const TILE_COLOR = '#2a7387';

/*
 * 완성선. 시접 바탕(#fce7f0)과 도안 채움(#fffdf5) 양쪽에서 3:1을 넘어야 한다.
 * 시접색을 바꾸면 여기도 다시 계산할 것.
 */
const SEAM_COLOR = '#94682f';

/*
 * 선 두께와 글자 크기는 도안 폭에 비례시킨다. mm 고정값으로 두면 작은 도안에서
 * 선이 굵고 글자가 커 보이고, 큰 도안에서는 반대가 된다. 화면에서 SVG 폭이
 * 컨테이너에 맞춰지므로 도안 폭이 곧 표시 배율이다.
 */
const CUT_STROKE_RATIO = 0.003;
const THIN_STROKE_RATIO = 0.002;
const BAND_LABEL_RATIO = 0.017;
const DIM_LABEL_RATIO = 0.015;
const TILE_LABEL_RATIO = 0.024;

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

const ORIENTATION_LABELS: Record<Pagination['orientation'], string> = {
  portrait: '세로',
  landscape: '가로',
};

/** 용지·방향·총 장수를 한 줄로 요약한다. 미리보기 위에 그대로 표시한다. */
export function describePagination(pagination: Pagination): string {
  const paper = pagination.paper.toUpperCase();
  const orientation = ORIENTATION_LABELS[pagination.orientation];
  return `${paper} ${orientation} · 총 ${pagination.pages.length}장 (${pagination.cols}열 × ${pagination.rows}행)`;
}

function toPolygonPoints(points: readonly Point[]): string {
  return points.map((p) => `${round1(p.xMm)},${round1(p.yMm)}`).join(' ');
}

function toClosedPath(points: readonly Point[]): string {
  const [first, ...rest] = points;
  if (first === undefined) return '';
  const head = `M ${round1(first.xMm)} ${round1(first.yMm)}`;
  const tail = rest.map((p) => `L ${round1(p.xMm)} ${round1(p.yMm)}`).join(' ');
  return `${head} ${tail} Z`;
}

export function renderPreviewSvg(layout: Layout, pagination: Pagination): string {
  const w = layout.totalWidthMm;
  const h = layout.totalHeightMm;

  const cutStroke = round1(w * CUT_STROKE_RATIO);
  const thinStroke = round1(w * THIN_STROKE_RATIO);
  const bandLabelSize = round1(w * BAND_LABEL_RATIO);
  const dimLabelSize = round1(w * DIM_LABEL_RATIO);
  const tileLabelSize = round1(w * TILE_LABEL_RATIO);
  const dash = (a: number, b: number) => `${round1(w * a)} ${round1(w * b)}`;

  const points = toPolygonPoints(layout.outlineMm);

  const tiles = pagination.pages
    .map((page) => {
      const tileW = Math.min(pagination.contentWidthMm, w - page.originXMm);
      const tileH = Math.min(pagination.contentHeightMm, h - page.originYMm);
      return `<rect class="page-tile" x="${round1(page.originXMm)}" y="${round1(page.originYMm)}" width="${round1(tileW)}" height="${round1(tileH)}" fill="none" stroke="${TILE_COLOR}" stroke-width="${thinStroke}" stroke-dasharray="${dash(0.023, 0.015)}" />`;
    })
    .join('');

  const tileLabels = pagination.pages
    .map(
      (page) =>
        `<text class="tile-label" x="${round1(page.originXMm + 4)}" y="${round1(page.originYMm + 14)}" font-size="${tileLabelSize}" fill="${TILE_COLOR}">${escapeXml(page.gridLabel)}</text>`,
    )
    .join('');

  // 재단선과 완성선을 두 개의 닫힌 경로로 묶고 evenodd로 채우면
  // 두 선 사이(=시접)만 칠해진다.
  const seamBand =
    `<path class="seam-band" d="${toClosedPath(layout.outlineMm)} ${toClosedPath(layout.seamLineMm)}"` +
    ` fill-rule="evenodd" fill="#fce7f0" fill-opacity="1" stroke="none" />`;

  const seamLine = `<polygon class="seam-line" points="${toPolygonPoints(layout.seamLineMm)}" fill="none" stroke="${SEAM_COLOR}" stroke-width="${thinStroke}" />`;

  const labels = layout.bands
    .map(
      (band) =>
        `<text x="${round1(band.xMm + band.widthMm / 2)}" y="${round1(band.yMm + band.heightMm / 2)}" class="band-label" text-anchor="middle" dominant-baseline="middle" font-size="${bandLabelSize}" fill="#333">${escapeXml(band.label)}</text>`,
    )
    .join('');

  const dims =
    `<text x="${round1(w / 2)}" y="${round1(-w * 0.03)}" text-anchor="middle" font-size="${dimLabelSize}" fill="#555">${round1(w)}mm</text>` +
    `<text x="${round1(-w * 0.03)}" y="${round1(h / 2)}" text-anchor="middle" font-size="${dimLabelSize}" fill="#555" transform="rotate(-90 ${round1(-w * 0.03)} ${round1(h / 2)})">${round1(h)}mm</text>`;

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${round1(w)} ${round1(h)}"`,
    ` style="overflow: visible; max-width: 100%; height: auto;" role="img"`,
    ` aria-label="${escapeXml(`가로 ${round1(w)}mm, 세로 ${round1(h)}mm 전개도 미리보기`)}">`,
    `<g transform="translate(0,0)">`,
    tiles,
    `<polygon points="${points}" fill="#fffdf5" stroke="#222" stroke-width="${cutStroke}" />`,
    seamBand,
    seamLine,
    tileLabels,
    labels,
    dims,
    `</g>`,
    `</svg>`,
  ].join('');
}
