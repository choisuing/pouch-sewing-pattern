// SPDX-License-Identifier: MIT
// Copyright (C) 2026 choisuing

import type { Layout } from './layout';

export type PaperSize = 'a4' | 'a3';
export type Orientation = 'portrait' | 'landscape';

export const PAPER_MM: Record<PaperSize, { widthMm: number; heightMm: number }> = {
  a4: { widthMm: 210, heightMm: 297 },
  a3: { widthMm: 297, heightMm: 420 },
};

/** 프린터 비인쇄 영역을 감안한 사방 여백 (mm) */
export const PAGE_MARGIN_MM = 8;

/** 이웃 페이지끼리 겹치는 폭 (mm). 잘라 붙일 여유. */
export const PAGE_OVERLAP_MM = 10;

export interface Page {
  readonly row: number;
  readonly col: number;
  readonly gridLabel: string;
  readonly originXMm: number;
  readonly originYMm: number;
}

export interface Pagination {
  readonly paper: PaperSize;
  readonly orientation: Orientation;
  readonly pageWidthMm: number;
  readonly pageHeightMm: number;
  readonly contentWidthMm: number;
  readonly contentHeightMm: number;
  readonly rows: number;
  readonly cols: number;
  readonly pages: readonly Page[];
}

function countTiles(totalMm: number, contentMm: number): number {
  const step = contentMm - PAGE_OVERLAP_MM;
  if (step <= 0) throw new Error('용지가 겹침 폭보다 작습니다.');
  if (totalMm <= contentMm) return 1;
  return Math.ceil((totalMm - PAGE_OVERLAP_MM) / step);
}

function gridLabel(row: number, col: number): string {
  return `${String.fromCharCode(65 + row)}${col + 1}`;
}

export function paginate(layout: Layout, paper: PaperSize): Pagination {
  const spec = PAPER_MM[paper];

  const candidates: readonly { orientation: Orientation; pageWidthMm: number; pageHeightMm: number }[] = [
    { orientation: 'portrait', pageWidthMm: spec.widthMm, pageHeightMm: spec.heightMm },
    { orientation: 'landscape', pageWidthMm: spec.heightMm, pageHeightMm: spec.widthMm },
  ];

  let best: Pagination | null = null;

  for (const candidate of candidates) {
    const contentWidthMm = candidate.pageWidthMm - 2 * PAGE_MARGIN_MM;
    const contentHeightMm = candidate.pageHeightMm - 2 * PAGE_MARGIN_MM;
    const cols = countTiles(layout.totalWidthMm, contentWidthMm);
    const rows = countTiles(layout.totalHeightMm, contentHeightMm);

    if (best !== null && rows * cols >= best.rows * best.cols) continue;

    const pages: Page[] = [];
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        pages.push({
          row,
          col,
          gridLabel: gridLabel(row, col),
          originXMm: col * (contentWidthMm - PAGE_OVERLAP_MM),
          originYMm: row * (contentHeightMm - PAGE_OVERLAP_MM),
        });
      }
    }

    best = {
      paper,
      orientation: candidate.orientation,
      pageWidthMm: candidate.pageWidthMm,
      pageHeightMm: candidate.pageHeightMm,
      contentWidthMm,
      contentHeightMm,
      rows,
      cols,
      pages,
    };
  }

  if (best === null) throw new Error('페이지를 계산하지 못했습니다.');
  return best;
}
