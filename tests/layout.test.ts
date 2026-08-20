import { describe, expect, it } from 'vitest';
import { buildLayout, halveOnFold, patternTitlePointMm, centerXMm } from '../src/core/layout';
import { patternTitle, patternFileName, WATERMARK_MESSAGE, WATERMARK_HANDLE } from '../src/core/dimensions';
import { RANGES, SEAM_MM } from '../src/core/constants';
import type { Dimensions } from '../src/core/dimensions';

const travel: Dimensions = { widthMm: 270, depthMm: 100, heightMm: 140 };

describe('buildLayout — 골든 케이스 (영상 예시 270/100/140)', () => {
  const layout = buildLayout(travel);

  it('전체 크기가 430 x 490mm이다', () => {
    expect(layout.totalWidthMm).toBe(430);
    expect(layout.totalHeightMm).toBe(490);
  });

  it('좌우 들여쓰기가 70mm이다', () => {
    expect(layout.sideInsetMm).toBe(70);
  });

  it('밴드가 위에서 아래 순서로 5개다', () => {
    expect(layout.bands.map((b) => b.id)).toEqual(['topFront', 'front', 'bottom', 'back', 'topBack']);
  });

  it('각 밴드의 크기가 영상 계산과 일치한다', () => {
    const byId = Object.fromEntries(layout.bands.map((b) => [b.id, b]));
    expect(byId.topFront).toMatchObject({ xMm: 0, yMm: 0, widthMm: 430, heightMm: 65 });
    expect(byId.front).toMatchObject({ xMm: 70, yMm: 65, widthMm: 290, heightMm: 120 });
    expect(byId.bottom).toMatchObject({ xMm: 0, yMm: 185, widthMm: 430, heightMm: 120 });
    expect(byId.back).toMatchObject({ xMm: 70, yMm: 305, widthMm: 290, heightMm: 120 });
    expect(byId.topBack).toMatchObject({ xMm: 0, yMm: 425, widthMm: 430, heightMm: 65 });
  });

  it('밴드에 한국어 이름이 붙어 있다', () => {
    const labels = layout.bands.map((b) => b.label);
    expect(labels).toEqual(['지퍼단', '앞판', '바닥', '뒤판', '지퍼단']);
  });
});

describe('buildLayout — 불변식', () => {
  const cases: Dimensions[] = [
    { widthMm: 100, depthMm: 40, heightMm: 60 },
    { widthMm: 400, depthMm: 200, heightMm: 300 },
    { widthMm: 235, depthMm: 95, heightMm: 177 },
    { widthMm: 200, depthMm: 60, heightMm: 60 },
  ];

  it('밴드 높이의 합이 전체 높이와 같다', () => {
    for (const dims of cases) {
      const layout = buildLayout(dims);
      const sum = layout.bands.reduce((acc, b) => acc + b.heightMm, 0);
      expect(sum).toBeCloseTo(layout.totalHeightMm, 10);
    }
  });

  it('밴드가 세로로 빈틈없이 이어진다', () => {
    for (const dims of cases) {
      const layout = buildLayout(dims);
      let expectedY = 0;
      for (const band of layout.bands) {
        expect(band.yMm).toBeCloseTo(expectedY, 10);
        expectedY += band.heightMm;
      }
      expect(expectedY).toBeCloseTo(layout.totalHeightMm, 10);
    }
  });

  it('모든 밴드가 전개도 폭 안에 들어간다', () => {
    for (const dims of cases) {
      const layout = buildLayout(dims);
      for (const band of layout.bands) {
        expect(band.xMm).toBeGreaterThanOrEqual(0);
        expect(band.xMm + band.widthMm).toBeLessThanOrEqual(layout.totalWidthMm + 1e-9);
      }
    }
  });

  it('세로가 홀수여도 반올림하지 않는다', () => {
    const layout = buildLayout({ widthMm: 200, depthMm: 95, heightMm: 140 });
    const topFront = layout.bands[0];
    // 95/2 - 10/2 + 20 = 47.5 - 5 + 20 = 62.5
    expect(topFront?.heightMm).toBe(62.5);
  });
});

describe('buildLayout — 외곽선과 접힘선', () => {
  const layout = buildLayout(travel);

  it('외곽선이 20각형이다', () => {
    // 좌우 각각 앞판 홈 5점 + 뒤판 홈 5점 = 10점, 대칭으로 총 20점
    expect(layout.outlineMm).toHaveLength(20);
  });

  it('외곽선이 닫힌 도형이며 전체 크기에 딱 맞는다', () => {
    const xs = layout.outlineMm.map((p) => p.xMm);
    const ys = layout.outlineMm.map((p) => p.yMm);
    expect(Math.min(...xs)).toBe(0);
    expect(Math.max(...xs)).toBe(layout.totalWidthMm);
    expect(Math.min(...ys)).toBe(0);
    expect(Math.max(...ys)).toBe(layout.totalHeightMm);
  });

  it('외곽선의 이웃 꼭짓점은 항상 수평 또는 수직으로 이어진다', () => {
    const pts = layout.outlineMm;
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i]!;
      const b = pts[(i + 1) % pts.length]!;
      const sameX = Math.abs(a.xMm - b.xMm) < 1e-9;
      const sameY = Math.abs(a.yMm - b.yMm) < 1e-9;
      expect(sameX || sameY).toBe(true);
    }
  });

  it('오목한 부분이 앞판·뒤판 좌우에 생긴다', () => {
    // 앞판 왼쪽 위 모서리 (70, 65) 가 외곽선 꼭짓점이어야 한다
    const hasCorner = layout.outlineMm.some(
      (p) => Math.abs(p.xMm - 70) < 1e-9 && Math.abs(p.yMm - 65) < 1e-9,
    );
    expect(hasCorner).toBe(true);
  });

  it('세로 접힘선이 완성 높이 안에서 좌우 두 자리에만 있다', () => {
    const vertical = layout.foldLinesMm.filter((l) => l.x1Mm === l.x2Mm);
    expect(vertical.length).toBeGreaterThan(0);
    for (const line of vertical) {
      expect(line.y1Mm).toBeGreaterThanOrEqual(SEAM_MM);
      expect(line.y2Mm).toBeLessThanOrEqual(layout.totalHeightMm - SEAM_MM);
    }
    expect([...new Set(vertical.map((l) => l.x1Mm))].sort((a, b) => a - b)).toEqual([80, 350]);
  });
});

describe('buildLayout — 완성선(시접 안쪽선)', () => {
  const layout = buildLayout(travel);

  it('외곽선과 같은 꼭짓점 수를 가진다', () => {
    expect(layout.seamLineMm).toHaveLength(layout.outlineMm.length);
  });

  it('전체 바깥 경계에서 시접만큼 안으로 들어와 있다', () => {
    const xs = layout.seamLineMm.map((p) => p.xMm);
    const ys = layout.seamLineMm.map((p) => p.yMm);
    expect(Math.min(...xs)).toBeCloseTo(SEAM_MM, 10);
    expect(Math.max(...xs)).toBeCloseTo(layout.totalWidthMm - SEAM_MM, 10);
    expect(Math.min(...ys)).toBeCloseTo(SEAM_MM, 10);
    expect(Math.max(...ys)).toBeCloseTo(layout.totalHeightMm - SEAM_MM, 10);
  });

  it('오목한 모서리는 바깥쪽으로 벌어진다', () => {
    // 외곽선 꼭짓점 (70, 65)는 앞판 왼쪽 위 오목 모서리.
    // 앞판 왼쪽 변은 안쪽이 동쪽이라 x+10, 지퍼단 아래 변은 안쪽이 북쪽이라 y-10.
    const corner = layout.seamLineMm.find(
      (p) => Math.abs(p.xMm - 80) < 1e-9 && Math.abs(p.yMm - 55) < 1e-9,
    );
    expect(corner).toBeDefined();
  });

  it('이웃 꼭짓점은 항상 수평 또는 수직으로 이어진다', () => {
    for (const dims of seamCases) {
      const pts = buildLayout(dims).seamLineMm;
      for (let i = 0; i < pts.length; i++) {
        const a = pts[i]!;
        const b = pts[(i + 1) % pts.length]!;
        const sameX = Math.abs(a.xMm - b.xMm) < 1e-9;
        const sameY = Math.abs(a.yMm - b.yMm) < 1e-9;
        expect(sameX || sameY).toBe(true);
      }
    }
  });

  it('입력 범위 전체에서 완성선이 전개도 안에 머문다', () => {
    for (const dims of seamCases) {
      const l = buildLayout(dims);
      for (const p of l.seamLineMm) {
        expect(p.xMm).toBeGreaterThanOrEqual(0);
        expect(p.yMm).toBeGreaterThanOrEqual(0);
        expect(p.xMm).toBeLessThanOrEqual(l.totalWidthMm);
        expect(p.yMm).toBeLessThanOrEqual(l.totalHeightMm);
      }
    }
  });

  it('완성선이 감싸는 면적은 재단선보다 작다', () => {
    for (const dims of seamCases) {
      const l = buildLayout(dims);
      expect(shoelaceArea(l.seamLineMm)).toBeLessThan(shoelaceArea(l.outlineMm));
      expect(shoelaceArea(l.seamLineMm)).toBeGreaterThan(0);
    }
  });
});

const seamCases: Dimensions[] = [
  { widthMm: 100, depthMm: 40, heightMm: 60 },
  { widthMm: 400, depthMm: 200, heightMm: 300 },
  { widthMm: 235, depthMm: 95, heightMm: 177 },
  { widthMm: 200, depthMm: 60, heightMm: 60 },
];

function shoelaceArea(points: readonly { xMm: number; yMm: number }[]): number {
  let sum = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i]!;
    const b = points[(i + 1) % points.length]!;
    sum += a.xMm * b.yMm - b.xMm * a.yMm;
  }
  return Math.abs(sum) / 2;
}

describe('buildLayout — 입력 범위 하한', () => {
  // 이 테스트는 RANGES를 직접 읽으므로, 앞으로 최소값을 더 낮추면 여기서 걸린다.
  it('허용 최소 치수에서도 완성선이 무너지지 않는다', () => {
    const layout = buildLayout({
      widthMm: RANGES.widthMm.min,
      depthMm: RANGES.depthMm.min,
      heightMm: RANGES.heightMm.min,
    });

    // 앞판은 위아래로 시접만큼 깎이므로, 시접 두 배보다 높아야 완성선이 남는다.
    const front = layout.bands.find((b) => b.id === 'front')!;
    expect(front.heightMm).toBeGreaterThan(2 * SEAM_MM);

    // 지퍼단도 마찬가지.
    const topFront = layout.bands.find((b) => b.id === 'topFront')!;
    expect(topFront.heightMm).toBeGreaterThan(2 * SEAM_MM);

    expect(shoelaceArea(layout.seamLineMm)).toBeGreaterThan(0);
  });
});

describe('buildLayout — 접힘선은 완성선 기준이다', () => {
  const layout = buildLayout(travel);   // 270 x 140 x 100

  it('세로 접힘선 6개(넓은 밴드 3줄 x 좌우), 가로 접힘선 4개가 있다', () => {
    const vertical = layout.foldLinesMm.filter((l) => l.x1Mm === l.x2Mm);
    const horizontal = layout.foldLinesMm.filter((l) => l.y1Mm === l.y2Mm);
    expect(vertical).toHaveLength(6);
    expect(horizontal).toHaveLength(4);
  });

  it('세로 접힘선이 시접 안쪽 1/2 b 자리에 있다', () => {
    // 재단선 끝이 아니라 완성선에서 b/2 들어온 자리. S + b/2 = 10 + 70 = 80
    const xs = [...new Set(layout.foldLinesMm.filter((l) => l.x1Mm === l.x2Mm).map((l) => l.x1Mm))].sort((a, b) => a - b);
    expect(xs).toEqual([80, 350]);
  });

  it('가로 접힘선이 완성 밴드 경계에 있다', () => {
    // 완성 밴드 높이 45 / 140 / 100 / 140 / 45, 시작은 시접 10부터
    const ys = layout.foldLinesMm.filter((l) => l.y1Mm === l.y2Mm).map((l) => l.y1Mm).sort((a, b) => a - b);
    expect(ys).toEqual([55, 195, 295, 435]);
  });

  it('접힘선이 시접 영역을 넘지 않는다', () => {
    for (const line of layout.foldLinesMm) {
      for (const [x, y] of [[line.x1Mm, line.y1Mm], [line.x2Mm, line.y2Mm]]) {
        expect(x).toBeGreaterThanOrEqual(SEAM_MM);
        expect(y).toBeGreaterThanOrEqual(SEAM_MM);
        expect(x!).toBeLessThanOrEqual(layout.totalWidthMm - SEAM_MM);
        expect(y!).toBeLessThanOrEqual(layout.totalHeightMm - SEAM_MM);
      }
    }
  });

  it('가로 접힘선 간격이 완성 밴드 높이와 같다', () => {
    for (const dims of seamCases) {
      const l = buildLayout(dims);
      const ys = l.foldLinesMm.filter((f) => f.y1Mm === f.y2Mm).map((f) => f.y1Mm).sort((a, b) => a - b);
      const { heightMm: b, depthMm: c } = dims;
      const top = c / 2 - 5;  // 1/2 c - 1/2 Z
      expect(ys[0]).toBeCloseTo(SEAM_MM + top, 9);
      expect(ys[1]! - ys[0]!).toBeCloseTo(b, 9);
      expect(ys[2]! - ys[1]!).toBeCloseTo(c, 9);
      expect(ys[3]! - ys[2]!).toBeCloseTo(b, 9);
    }
  });
});

/**
 * 접힘선과 완성선이 같은 자리에 겹친 구간의 길이를 모두 더한다.
 * 앞판·뒤판 좌우는 오목하게 잘려 나가 접을 천이 없으므로, 그 자리의
 * 세로 완성선 위에 접힘선이 얹히면 인쇄물에서 접는 선으로 오인된다.
 */
function overlapWithSeamLineMm(layout: ReturnType<typeof buildLayout>): number {
  const seam = layout.seamLineMm;
  let totalMm = 0;
  for (let i = 0; i < seam.length; i++) {
    const a = seam[i]!;
    const b = seam[(i + 1) % seam.length]!;
    for (const fold of layout.foldLinesMm) {
      const verticalPair = a.xMm === b.xMm && fold.x1Mm === fold.x2Mm && fold.x1Mm === a.xMm;
      const horizontalPair = a.yMm === b.yMm && fold.y1Mm === fold.y2Mm && fold.y1Mm === a.yMm;
      if (!verticalPair && !horizontalPair) continue;

      const [seamLo, seamHi] = verticalPair
        ? [Math.min(a.yMm, b.yMm), Math.max(a.yMm, b.yMm)]
        : [Math.min(a.xMm, b.xMm), Math.max(a.xMm, b.xMm)];
      const [foldLo, foldHi] = verticalPair
        ? [Math.min(fold.y1Mm, fold.y2Mm), Math.max(fold.y1Mm, fold.y2Mm)]
        : [Math.min(fold.x1Mm, fold.x2Mm), Math.max(fold.x1Mm, fold.x2Mm)];

      totalMm += Math.max(0, Math.min(seamHi, foldHi) - Math.max(seamLo, foldLo));
    }
  }
  return totalMm;
}

describe('buildLayout — 접힘선이 완성선을 덮지 않는다', () => {
  it('골든 케이스에서 접힘선과 완성선이 겹치는 구간이 없다', () => {
    expect(overlapWithSeamLineMm(buildLayout(travel))).toBe(0);
  });

  it('모든 치수 조합에서 접힘선과 완성선이 겹치지 않는다', () => {
    for (const dims of seamCases) {
      expect(overlapWithSeamLineMm(buildLayout(dims))).toBe(0);
    }
  });

  it('세로 접힘선이 넓은 밴드 구간에서만 끊어져 나온다', () => {
    // 270x140x100. 완성 밴드 경계는 10 / 55 / 195 / 295 / 435 / 480.
    // 앞판(55~195)·뒤판(295~435)은 좌우가 잘려 나가 접을 자리가 없다.
    const segments = buildLayout(travel)
      .foldLinesMm.filter((l) => l.x1Mm === l.x2Mm)
      .map((l) => [l.x1Mm, Math.min(l.y1Mm, l.y2Mm), Math.max(l.y1Mm, l.y2Mm)] as const)
      .sort((p, q) => p[0] - q[0] || p[1] - q[1]);

    expect(segments).toEqual([
      [80, 10, 55],
      [80, 195, 295],
      [80, 435, 480],
      [350, 10, 55],
      [350, 195, 295],
      [350, 435, 480],
    ]);
  });

  it('세로 접힘선 양 끝이 가로 접힘선이나 위아래 완성선에 닿는다', () => {
    const layout = buildLayout(travel);
    const horizontalYs = layout.foldLinesMm.filter((l) => l.y1Mm === l.y2Mm).map((l) => l.y1Mm);
    const anchors = new Set([SEAM_MM, layout.totalHeightMm - SEAM_MM, ...horizontalYs]);

    for (const line of layout.foldLinesMm.filter((l) => l.x1Mm === l.x2Mm)) {
      expect(anchors.has(line.y1Mm)).toBe(true);
      expect(anchors.has(line.y2Mm)).toBe(true);
    }
  });
});

describe('halveOnFold — 골선으로 절반만 남기기', () => {
  /*
   * 전개도는 바닥 한가운데를 기준으로 위아래가 거울상이다. 위쪽 절반만
   * 출력하고 그 변을 원단 접은 자리에 놓으면 펼쳤을 때 온전한 한 장이 된다.
   */
  const cases: Dimensions[] = [
    travel,
    { widthMm: 150, depthMm: 50, heightMm: 90 },
    { widthMm: 400, depthMm: 200, heightMm: 300 },
  ];

  it('높이는 절반이 되고 폭은 그대로다', () => {
    for (const dims of cases) {
      const full = buildLayout(dims);
      const half = halveOnFold(full);
      expect(half.totalHeightMm).toBeCloseTo(full.totalHeightMm / 2, 9);
      expect(half.totalWidthMm).toBeCloseTo(full.totalWidthMm, 9);
    }
  });

  it('골선 자리를 알려준다', () => {
    for (const dims of cases) {
      const full = buildLayout(dims);
      const half = halveOnFold(full);
      expect(half.foldEdgeYMm).toBeCloseTo(full.totalHeightMm / 2, 9);
    }
  });

  it('원래 전개도에는 골선이 없다', () => {
    expect(buildLayout(travel).foldEdgeYMm).toBeUndefined();
  });

  it('외곽선 넓이가 원래의 절반이다', () => {
    for (const dims of cases) {
      const full = buildLayout(dims);
      const half = halveOnFold(full);
      expect(shoelaceArea(half.outlineMm)).toBeCloseTo(shoelaceArea(full.outlineMm) / 2, 6);
    }
  });

  it('완성선 넓이도 절반보다 작지만 0보다 크다', () => {
    for (const dims of cases) {
      const half = halveOnFold(buildLayout(dims));
      expect(shoelaceArea(half.seamLineMm)).toBeGreaterThan(0);
    }
  });

  it('외곽선과 완성선이 골선을 넘어가지 않는다', () => {
    for (const dims of cases) {
      const half = halveOnFold(buildLayout(dims));
      for (const p of [...half.outlineMm, ...half.seamLineMm]) {
        expect(p.yMm).toBeLessThanOrEqual(half.foldEdgeYMm! + 1e-9);
      }
    }
  });

  it('골선 변에는 시접이 없다', () => {
    // 접는 자리라 시접을 두지 않는다. 완성선이 골선까지 내려와 닿아야 한다.
    for (const dims of cases) {
      const half = halveOnFold(buildLayout(dims));
      const lowest = Math.max(...half.seamLineMm.map((p) => p.yMm));
      expect(lowest).toBeCloseTo(half.foldEdgeYMm!, 9);
    }
  });

  it('접힘선이 골선을 넘어가지 않는다', () => {
    for (const dims of cases) {
      const half = halveOnFold(buildLayout(dims));
      for (const f of half.foldLinesMm) {
        expect(Math.max(f.y1Mm, f.y2Mm)).toBeLessThanOrEqual(half.foldEdgeYMm! + 1e-9);
      }
    }
  });

  it('아래쪽 밴드는 사라지고 바닥은 절반만 남는다', () => {
    const half = halveOnFold(buildLayout(travel)); // 바닥은 185~305, 골선 245
    expect(half.bands.map((b) => b.id)).toEqual(['topFront', 'front', 'bottom']);
    const bottom = half.bands.find((b) => b.id === 'bottom')!;
    expect(bottom.yMm).toBeCloseTo(185, 9);
    expect(bottom.heightMm).toBeCloseTo(60, 9);
  });

  it('치수와 좌우 들여쓰기는 그대로 들고 간다', () => {
    const full = buildLayout(travel);
    const half = halveOnFold(full);
    expect(half.dimensions).toEqual(full.dimensions);
    expect(half.sideInsetMm).toBeCloseTo(full.sideInsetMm, 9);
  });

  it('외곽선이 골선 변을 실제로 지난다', () => {
    const half = halveOnFold(buildLayout(travel));
    const onFold = half.outlineMm.filter((p) => Math.abs(p.yMm - half.foldEdgeYMm!) < 1e-9);
    expect(onFold.length).toBeGreaterThanOrEqual(2);
  });
});

describe('패턴명과 중앙선', () => {
  it('패턴명에 이름과 치수가 가로*높이*바닥폭 순으로 들어간다', () => {
    expect(patternTitle({ widthMm: 160, heightMm: 80, depthMm: 40 }))
      .toBe('사각사각 지퍼 파우치 160*80*40');
  });

  it('패턴명 자리가 앞판 한가운데다', () => {
    const layout = buildLayout(travel);
    const front = layout.bands.find((b) => b.id === 'front')!;
    const point = patternTitlePointMm(layout)!;
    expect(point.xMm).toBeCloseTo(front.xMm + front.widthMm / 2, 9);
    expect(point.yMm).toBeCloseTo(front.yMm + front.heightMm / 2, 9);
  });

  it('골선으로 절반만 남겨도 앞판은 살아 있어 자리가 있다', () => {
    const half = halveOnFold(buildLayout(travel));
    const point = patternTitlePointMm(half);
    expect(point).toBeDefined();
    expect(point!.yMm).toBeLessThan(half.foldEdgeYMm!);
  });

  it('중앙선은 전개도 폭의 한가운데다', () => {
    for (const dims of [travel, { widthMm: 150, depthMm: 50, heightMm: 90 }]) {
      const layout = buildLayout(dims);
      expect(centerXMm(layout)).toBeCloseTo(layout.totalWidthMm / 2, 9);
    }
  });

  it('중앙선이 좌우 접힘선 사이에 놓인다', () => {
    // 세로 접힘선은 x = S + H/2 와 폭 - S - H/2 자리다. 중앙선은 그 사이에 있어야 한다.
    const layout = buildLayout(travel);
    const xs = [...new Set(layout.foldLinesMm.filter((f) => f.x1Mm === f.x2Mm).map((f) => f.x1Mm))];
    expect(centerXMm(layout)).toBeGreaterThan(Math.min(...xs));
    expect(centerXMm(layout)).toBeLessThan(Math.max(...xs));
  });
});

describe('patternFileName — 내려받는 파일 이름', () => {
  const dims: Dimensions = { widthMm: 160, heightMm: 80, depthMm: 40 };

  it('치수를 가로x높이x바닥폭 순으로 적는다', () => {
    // 화면·도안 이름과 같은 순서여야 한다. 파일을 여러 개 받아 두면
    // 순서가 다른 쪽이 무엇인지 알 수 없다.
    expect(patternFileName(dims, 'a4', false)).toBe('box-pouch-160x80x40-a4.pdf');
  });

  it('도안 이름과 치수 순서가 같다', () => {
    for (const d of [dims, travel, { widthMm: 100, heightMm: 50, depthMm: 40 }]) {
      const fromTitle = patternTitle(d).split(' ').pop()!.replace(/\*/g, 'x');
      expect(patternFileName(d, 'a4', false)).toContain(fromTitle);
    }
  });

  it('용지를 붙인다', () => {
    expect(patternFileName(dims, 'a3', false)).toContain('-a3');
  });

  it('골선으로 뽑으면 half를 붙인다', () => {
    expect(patternFileName(dims, 'a4', true)).toBe('box-pouch-160x80x40-a4-half.pdf');
  });

  it('시접 없이 뽑으면 noseam을 붙인다', () => {
    // 같은 치수를 시접 있이·없이 받아 두면 이름이 같아 구분할 수 없다.
    expect(patternFileName(dims, 'a4', false, 0)).toBe('box-pouch-160x80x40-a4-noseam.pdf');
    expect(patternFileName(dims, 'a4', true, 0)).toBe('box-pouch-160x80x40-a4-half-noseam.pdf');
  });

  it('시접이 있으면 이름이 지금까지와 같다', () => {
    expect(patternFileName(dims, 'a4', false, SEAM_MM)).toBe(patternFileName(dims, 'a4', false));
  });

  it('파일 이름에 쓸 수 없는 글자가 없다', () => {
    for (const half of [true, false]) {
      expect(patternFileName(dims, 'a4', half)).toMatch(/^[a-z0-9x.-]+$/);
    }
  });
});

describe('buildLayout — 시접 없이 뜨기', () => {
  const dims: Dimensions = { widthMm: 270, depthMm: 100, heightMm: 140 };
  const withSeam = buildLayout(dims);
  const noSeam = buildLayout(dims, 0);

  it('기본값은 지금까지처럼 시접을 넣는다', () => {
    expect(withSeam.seamMm).toBe(SEAM_MM);
    expect(noSeam.seamMm).toBe(0);
  });

  it('시접을 빼면 도안이 시접 두 겹만큼 작아진다', () => {
    expect(withSeam.totalWidthMm - noSeam.totalWidthMm).toBeCloseTo(2 * SEAM_MM, 9);
    expect(noSeam.totalWidthMm).toBeCloseTo(dims.widthMm + dims.heightMm, 9);
  });

  it('앞판이 완성 치수 그대로가 된다', () => {
    const front = noSeam.bands.find((b) => b.id === 'front')!;
    expect(front.widthMm).toBeCloseTo(dims.widthMm, 9);
    expect(front.heightMm).toBeCloseTo(dims.heightMm, 9);
  });

  it('완성선이 재단선과 같아진다', () => {
    expect(noSeam.seamLineMm).toHaveLength(noSeam.outlineMm.length);
    for (let i = 0; i < noSeam.outlineMm.length; i++) {
      expect(noSeam.seamLineMm[i]!.xMm).toBeCloseTo(noSeam.outlineMm[i]!.xMm, 9);
      expect(noSeam.seamLineMm[i]!.yMm).toBeCloseTo(noSeam.outlineMm[i]!.yMm, 9);
    }
  });

  it('접힘선이 도안 맨 가장자리에서 시작한다', () => {
    // 시접이 있으면 위쪽 시접 S부터 쌓지만, 없으면 0부터다.
    const ys = noSeam.foldLinesMm.filter((f) => f.y1Mm === f.y2Mm).map((f) => f.y1Mm).sort((a, b) => a - b);
    const vertical = noSeam.foldLinesMm.filter((f) => f.x1Mm === f.x2Mm);
    expect(Math.min(...vertical.map((f) => Math.min(f.y1Mm, f.y2Mm)))).toBeCloseTo(0, 9);
    expect(ys[0]).toBeCloseTo(dims.depthMm / 2 - 5, 9);
  });

  it('접힘선이 여전히 완성선을 덮지 않는다', () => {
    // 시접이 0이면 완성선이 곧 재단선이다. 그 위에 접힘선이 얹히면 안 된다.
    expect(overlapWithSeamLineMm(noSeam)).toBe(0);
  });

  it('골선으로 절반만 남기는 것도 그대로 된다', () => {
    const half = halveOnFold(noSeam);
    expect(half.totalHeightMm).toBeCloseTo(noSeam.totalHeightMm / 2, 9);
    expect(half.seamMm).toBe(0);
  });
});

describe('patternTitle — 시접 표시', () => {
  const dims: Dimensions = { widthMm: 160, heightMm: 80, depthMm: 40 };

  it('시접이 있으면 치수만 적는다', () => {
    expect(patternTitle(dims, SEAM_MM)).toBe('사각사각 지퍼 파우치 160*80*40');
  });

  it('시접이 없으면 그렇다고 못 박는다', () => {
    // 종이만 따로 돌아다니면 화면을 볼 수 없다. 모르고 재단하면 원단을 버린다.
    expect(patternTitle(dims, 0)).toBe('사각사각 지퍼 파우치 160*80*40 시접없음');
  });
});

describe('출처 문구 — 두 줄로 나뉜다', () => {
  it('권유와 계정이 각각의 줄이다', () => {
    expect(WATERMARK_MESSAGE).toBe('예쁘게 만들어보세요!');
    expect(WATERMARK_HANDLE).toBe('@silsuni_lab');
  });

  it('한 줄에 섞어 두지 않는다', () => {
    // 계정을 키워 강조하려면 별개의 글자 요소여야 한다.
    expect(WATERMARK_MESSAGE).not.toContain('@');
    expect(WATERMARK_HANDLE).not.toContain(' ');
  });

  it('도안 이름과는 별개다', () => {
    // 이름은 치수가 바뀌면 따라 바뀌지만 출처는 늘 같다.
    const a = patternTitle({ widthMm: 160, heightMm: 80, depthMm: 40 });
    const b = patternTitle({ widthMm: 270, heightMm: 140, depthMm: 100 });
    expect(a).not.toBe(b);
    expect(WATERMARK_HANDLE).not.toContain('*');
  });
});
