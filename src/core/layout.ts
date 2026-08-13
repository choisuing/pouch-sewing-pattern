import { SEAM_MM, ZIPPER_ALLOWANCE_MM } from './constants';
import type { Dimensions } from './dimensions';

export type BandId = 'topFront' | 'front' | 'bottom' | 'back' | 'topBack';

export interface Band {
  readonly id: BandId;
  readonly label: string;
  readonly xMm: number;
  readonly yMm: number;
  readonly widthMm: number;
  readonly heightMm: number;
}

export interface Point {
  readonly xMm: number;
  readonly yMm: number;
}

export interface Line {
  readonly x1Mm: number;
  readonly y1Mm: number;
  readonly x2Mm: number;
  readonly y2Mm: number;
}

export interface Layout {
  readonly dimensions: Dimensions;
  readonly totalWidthMm: number;
  readonly totalHeightMm: number;
  /** 앞판·뒤판이 좌우로 들어가는 양 (mm). 이 부분이 접혀 옆면이 된다. */
  readonly sideInsetMm: number;
  readonly bands: readonly Band[];
  readonly outlineMm: readonly Point[];
  readonly foldLinesMm: readonly Line[];
}

export function buildLayout(dimensions: Dimensions): Layout {
  const { widthMm: W, depthMm: D, heightMm: H } = dimensions;
  const S = SEAM_MM;
  const Z = ZIPPER_ALLOWANCE_MM;

  const totalWidthMm = W + H + 2 * S;
  const panelWidthMm = W + 2 * S;
  const sideInsetMm = H / 2;

  const topBandHeightMm = D / 2 - Z / 2 + 2 * S;
  const panelHeightMm = H - 2 * S;
  const bottomBandHeightMm = D + 2 * S;

  const specs: readonly { id: BandId; label: string; widthMm: number; heightMm: number }[] = [
    { id: 'topFront', label: '지퍼단', widthMm: totalWidthMm, heightMm: topBandHeightMm },
    { id: 'front', label: '앞판', widthMm: panelWidthMm, heightMm: panelHeightMm },
    { id: 'bottom', label: '바닥', widthMm: totalWidthMm, heightMm: bottomBandHeightMm },
    { id: 'back', label: '뒤판', widthMm: panelWidthMm, heightMm: panelHeightMm },
    { id: 'topBack', label: '지퍼단', widthMm: totalWidthMm, heightMm: topBandHeightMm },
  ];

  const bands: Band[] = [];
  let y = 0;
  for (const spec of specs) {
    bands.push({
      id: spec.id,
      label: spec.label,
      xMm: (totalWidthMm - spec.widthMm) / 2,
      yMm: y,
      widthMm: spec.widthMm,
      heightMm: spec.heightMm,
    });
    y += spec.heightMm;
  }

  return {
    dimensions,
    totalWidthMm,
    totalHeightMm: y,
    sideInsetMm,
    bands,
    outlineMm: [],
    foldLinesMm: [],
  };
}
