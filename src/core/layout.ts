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
  /** 재단선 안쪽으로 시접만큼 들어간 박음질선. */
  readonly seamLineMm: readonly Point[];
  readonly foldLinesMm: readonly Line[];
}

/**
 * 모든 변이 수평·수직인 시계 방향 폴리곤을 안쪽으로 `distanceMm`만큼 민다.
 * y가 아래로 증가하는 좌표계에서 시계 방향 폴리곤의 안쪽 법선은
 * 진행 방향 `(dx, dy)`에 대해 `(-dy, dx)`이다. 꼭짓점마다 수평 변이 y를,
 * 수직 변이 x를 정해주므로 두 변의 오프셋선 교점이 곧 새 꼭짓점이다.
 */
function offsetInward(points: readonly Point[], distanceMm: number): Point[] {
  const n = points.length;
  return points.map((cur, i) => {
    const prev = points[(i - 1 + n) % n]!;
    const next = points[(i + 1) % n]!;
    const incoming = { dx: Math.sign(cur.xMm - prev.xMm), dy: Math.sign(cur.yMm - prev.yMm) };
    const outgoing = { dx: Math.sign(next.xMm - cur.xMm), dy: Math.sign(next.yMm - cur.yMm) };

    const incomingIsHorizontal = incoming.dy === 0;
    if (incomingIsHorizontal === (outgoing.dy === 0)) {
      throw new Error('외곽선의 이웃 변이 수평·수직으로 번갈아 나오지 않습니다.');
    }

    return incomingIsHorizontal
      ? { xMm: cur.xMm - distanceMm * outgoing.dy, yMm: cur.yMm + distanceMm * incoming.dx }
      : { xMm: cur.xMm - distanceMm * incoming.dy, yMm: cur.yMm + distanceMm * outgoing.dx };
  });
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

  const left = sideInsetMm;
  const right = totalWidthMm - sideInsetMm;
  const topBandBottom = topBandHeightMm;
  const frontBottom = topBandBottom + panelHeightMm;
  const bottomBandBottom = frontBottom + bottomBandHeightMm;
  const backBottom = bottomBandBottom + panelHeightMm;
  const total = y;

  // 좌상단에서 시계 방향으로 한 바퀴.
  // 오른쪽 변을 내려가며 앞판 홈 → 뒤판 홈, 왼쪽 변을 올라오며 뒤판 홈 → 앞판 홈.
  const outlineMm: Point[] = [
    { xMm: 0, yMm: 0 },
    { xMm: totalWidthMm, yMm: 0 },
    // 오른쪽 — 앞판 홈
    { xMm: totalWidthMm, yMm: topBandBottom },
    { xMm: right, yMm: topBandBottom },
    { xMm: right, yMm: frontBottom },
    { xMm: totalWidthMm, yMm: frontBottom },
    // 오른쪽 — 뒤판 홈
    { xMm: totalWidthMm, yMm: bottomBandBottom },
    { xMm: right, yMm: bottomBandBottom },
    { xMm: right, yMm: backBottom },
    { xMm: totalWidthMm, yMm: backBottom },
    { xMm: totalWidthMm, yMm: total },
    { xMm: 0, yMm: total },
    // 왼쪽 — 뒤판 홈
    { xMm: 0, yMm: backBottom },
    { xMm: left, yMm: backBottom },
    { xMm: left, yMm: bottomBandBottom },
    { xMm: 0, yMm: bottomBandBottom },
    // 왼쪽 — 앞판 홈
    { xMm: 0, yMm: frontBottom },
    { xMm: left, yMm: frontBottom },
    { xMm: left, yMm: topBandBottom },
    { xMm: 0, yMm: topBandBottom },
  ];

  /*
   * 접힘선은 재단선이 아니라 완성선을 기준으로 잡는다. 밴드 높이는
   * 재단 치수(시접 포함)라서 그 경계를 그대로 쓰면 시접만큼 밀린다.
   * 완성 밴드 높이는 윗단 D/2 - Z/2, 앞뒤판 H, 바닥 D이고,
   * 시작점은 위쪽 시접 S부터다.
   */
  const foldLeft = S + sideInsetMm;
  const foldRight = totalWidthMm - S - sideInsetMm;
  const foldTop = S;
  const foldBottom = total - S;

  const finishedBandHeights = [D / 2 - Z / 2, H, D, H];
  const foldLinesMm: Line[] = [
    { x1Mm: foldLeft, y1Mm: foldTop, x2Mm: foldLeft, y2Mm: foldBottom },
    { x1Mm: foldRight, y1Mm: foldTop, x2Mm: foldRight, y2Mm: foldBottom },
  ];

  let foldY = foldTop;
  for (const height of finishedBandHeights) {
    foldY += height;
    foldLinesMm.push({ x1Mm: foldLeft, y1Mm: foldY, x2Mm: foldRight, y2Mm: foldY });
  }

  return {
    dimensions,
    totalWidthMm,
    totalHeightMm: y,
    sideInsetMm,
    bands,
    outlineMm,
    seamLineMm: offsetInward(outlineMm, S),
    foldLinesMm,
  };
}
