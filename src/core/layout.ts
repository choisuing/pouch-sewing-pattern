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
  /**
   * 골선 자리 (mm). 절반만 남긴 전개도에만 있다. 이 변을 원단 접은 자리에
   * 놓고 재단해 펼치면 온전한 한 장이 된다. 접는 자리라 시접이 없다.
   */
  readonly foldEdgeYMm?: number;
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

  // heightMm은 시접이 포함된 재단 높이, finishedHeightMm은 완성 높이다.
  // 접힘선은 완성 높이로 잡아야 하므로 둘을 함께 들고 다닌다.
  const specs: readonly {
    id: BandId;
    label: string;
    widthMm: number;
    heightMm: number;
    finishedHeightMm: number;
  }[] = [
    { id: 'topFront', label: '지퍼단', widthMm: totalWidthMm, heightMm: topBandHeightMm, finishedHeightMm: D / 2 - Z / 2 },
    { id: 'front', label: '앞판', widthMm: panelWidthMm, heightMm: panelHeightMm, finishedHeightMm: H },
    { id: 'bottom', label: '바닥', widthMm: totalWidthMm, heightMm: bottomBandHeightMm, finishedHeightMm: D },
    { id: 'back', label: '뒤판', widthMm: panelWidthMm, heightMm: panelHeightMm, finishedHeightMm: H },
    { id: 'topBack', label: '지퍼단', widthMm: totalWidthMm, heightMm: topBandHeightMm, finishedHeightMm: D / 2 - Z / 2 },
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
   * 완성 밴드 경계는 위쪽 시접 S부터 완성 높이를 쌓아 얻는다.
   */
  const foldLeft = S + sideInsetMm;
  const foldRight = totalWidthMm - S - sideInsetMm;

  const finishedEdges: number[] = [S];
  for (const spec of specs) {
    finishedEdges.push(finishedEdges[finishedEdges.length - 1]! + spec.finishedHeightMm);
  }

  const foldLinesMm: Line[] = [];

  /*
   * 세로 접힘선은 전개도 폭을 꽉 채우는 밴드(지퍼단·바닥)에만 긋는다.
   * 앞판·뒤판은 좌우가 오목하게 잘려 나가 접을 천이 없고, 그 자리는
   * 접는 선이 아니라 옆면과 이어 박는 완성선이다. 여기에 접힘선을 얹으면
   * 인쇄물에서 완성선을 접는 선으로 오인하게 된다.
   */
  specs.forEach((spec, i) => {
    if (spec.widthMm !== totalWidthMm) return;
    const topMm = finishedEdges[i]!;
    const bottomMm = finishedEdges[i + 1]!;
    foldLinesMm.push({ x1Mm: foldLeft, y1Mm: topMm, x2Mm: foldLeft, y2Mm: bottomMm });
    foldLinesMm.push({ x1Mm: foldRight, y1Mm: topMm, x2Mm: foldRight, y2Mm: bottomMm });
  });

  // 가로 접힘선은 밴드와 밴드 사이 경계다. 맨 위·맨 아래는 완성선이라 뺀다.
  for (let i = 1; i < finishedEdges.length - 1; i++) {
    const yMm = finishedEdges[i]!;
    foldLinesMm.push({ x1Mm: foldLeft, y1Mm: yMm, x2Mm: foldRight, y2Mm: yMm });
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

/**
 * 반평면 `y ≤ limitMm`으로 폴리곤을 자른다 (Sutherland–Hodgman).
 * 이 전개도의 변은 모두 수평·수직이라 자른 뒤에도 그 성질이 유지된다.
 * 꼭짓점이 자르는 선에 정확히 얹히면 같은 점이 두 번 나올 수 있어 이어지는
 * 중복은 걸러 낸다.
 */
function clipBelow(points: readonly Point[], limitMm: number): Point[] {
  const out: Point[] = [];
  const push = (p: Point) => {
    const last = out[out.length - 1];
    if (last !== undefined && Math.abs(last.xMm - p.xMm) < 1e-9 && Math.abs(last.yMm - p.yMm) < 1e-9) return;
    out.push(p);
  };

  for (let i = 0; i < points.length; i++) {
    const cur = points[i]!;
    const next = points[(i + 1) % points.length]!;
    const curIn = cur.yMm <= limitMm + 1e-9;
    const nextIn = next.yMm <= limitMm + 1e-9;

    if (curIn) push(cur);
    if (curIn !== nextIn) {
      const t = (limitMm - cur.yMm) / (next.yMm - cur.yMm);
      push({ xMm: cur.xMm + (next.xMm - cur.xMm) * t, yMm: limitMm });
    }
  }

  // 마지막 점이 첫 점과 겹치면 닫는 변이 길이 0이 된다.
  const first = out[0];
  const last = out[out.length - 1];
  if (
    out.length > 1 &&
    first !== undefined &&
    last !== undefined &&
    Math.abs(first.xMm - last.xMm) < 1e-9 &&
    Math.abs(first.yMm - last.yMm) < 1e-9
  ) {
    out.pop();
  }
  return out;
}

/**
 * 골선 기준으로 위쪽 절반만 남긴다.
 *
 * 전개도는 바닥 한가운데를 기준으로 위아래가 거울상이다. 밴드 높이가 위에서
 * 아래로 a·b·c·b·a라서 가운데를 접으면 정확히 포개진다. 절반만 인쇄해
 * 그 변을 원단 접은 자리에 놓고 재단하면 펼쳤을 때 온전한 한 장이 나온다.
 * 인쇄 장수는 대략 절반으로 준다.
 *
 * 완성선은 따로 손보지 않는다. 이미 계산된 완성선을 같은 높이에서 자르면
 * 골선 변에는 안쪽으로 들어온 몫이 없어, 접는 자리에 시접이 없다는 규칙이
 * 저절로 지켜진다.
 */
export function halveOnFold(layout: Layout): Layout {
  const foldEdgeYMm = layout.totalHeightMm / 2;

  const bands = layout.bands
    .filter((band) => band.yMm < foldEdgeYMm - 1e-9)
    .map((band) => ({
      ...band,
      heightMm: Math.min(band.heightMm, foldEdgeYMm - band.yMm),
    }));

  const foldLinesMm = layout.foldLinesMm
    .filter((line) => Math.min(line.y1Mm, line.y2Mm) < foldEdgeYMm - 1e-9)
    .map((line) => ({
      ...line,
      y1Mm: Math.min(line.y1Mm, foldEdgeYMm),
      y2Mm: Math.min(line.y2Mm, foldEdgeYMm),
    }));

  return {
    ...layout,
    totalHeightMm: foldEdgeYMm,
    bands,
    outlineMm: clipBelow(layout.outlineMm, foldEdgeYMm),
    seamLineMm: clipBelow(layout.seamLineMm, foldEdgeYMm),
    foldLinesMm,
    foldEdgeYMm,
  };
}

/** 세로 중앙선 자리 (mm). 앞판·바닥의 가로 한가운데라 원단에 올릴 때 기준이 된다. */
export function centerXMm(layout: Layout): number {
  return layout.totalWidthMm / 2;
}

/**
 * 도안 이름을 찍을 자리 (mm). 앞판 한가운데다.
 * 앞판은 전개도에서 가장 넓게 비어 있고, 골선으로 절반만 남겨도 살아 있다.
 */
export function patternTitlePointMm(layout: Layout): { xMm: number; yMm: number } | undefined {
  const front = layout.bands.find((band) => band.id === 'front');
  if (front === undefined) return undefined;
  return { xMm: front.xMm + front.widthMm / 2, yMm: front.yMm + front.heightMm / 2 };
}
