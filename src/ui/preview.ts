import type { Layout } from '../core/layout';
import type { Pagination } from '../core/tiling';

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

export function renderPreviewSvg(layout: Layout, pagination: Pagination): string {
  const w = layout.totalWidthMm;
  const h = layout.totalHeightMm;

  const points = layout.outlineMm.map((p) => `${round1(p.xMm)},${round1(p.yMm)}`).join(' ');

  const tiles = pagination.pages
    .map((page) => {
      const tileW = Math.min(pagination.contentWidthMm, w - page.originXMm);
      const tileH = Math.min(pagination.contentHeightMm, h - page.originYMm);
      return `<rect class="page-tile" x="${round1(page.originXMm)}" y="${round1(page.originYMm)}" width="${round1(tileW)}" height="${round1(tileH)}" fill="none" stroke="#c8d4e8" stroke-width="1" stroke-dasharray="6 4" />`;
    })
    .join('');

  const folds = layout.foldLinesMm
    .map(
      (line) =>
        `<line x1="${round1(line.x1Mm)}" y1="${round1(line.y1Mm)}" x2="${round1(line.x2Mm)}" y2="${round1(line.y2Mm)}" stroke="#888" stroke-width="1" stroke-dasharray="8 5" />`,
    )
    .join('');

  const bandLines = layout.bands
    .filter((band) => band.yMm > 0)
    .map(
      (band) =>
        `<line x1="${round1(band.xMm)}" y1="${round1(band.yMm)}" x2="${round1(band.xMm + band.widthMm)}" y2="${round1(band.yMm)}" stroke="#888" stroke-width="1" stroke-dasharray="8 5" />`,
    )
    .join('');

  const labels = layout.bands
    .map(
      (band) =>
        `<text x="${round1(band.xMm + band.widthMm / 2)}" y="${round1(band.yMm + band.heightMm / 2)}" text-anchor="middle" dominant-baseline="middle" font-size="14" fill="#333">${escapeXml(band.label)}</text>`,
    )
    .join('');

  const dims =
    `<text x="${round1(w / 2)}" y="-8" text-anchor="middle" font-size="14" fill="#555">${round1(w)}mm</text>` +
    `<text x="-8" y="${round1(h / 2)}" text-anchor="middle" font-size="14" fill="#555" transform="rotate(-90 -8 ${round1(h / 2)})">${round1(h)}mm</text>`;

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${round1(w)} ${round1(h)}"`,
    ` style="overflow: visible; max-width: 100%; height: auto;" role="img"`,
    ` aria-label="${escapeXml(`가로 ${round1(w)}mm, 세로 ${round1(h)}mm 전개도 미리보기`)}">`,
    `<g transform="translate(0,0)">`,
    tiles,
    `<polygon points="${points}" fill="#fffdf5" stroke="#222" stroke-width="2" />`,
    bandLines,
    folds,
    labels,
    dims,
    `</g>`,
    `</svg>`,
  ].join('');
}
