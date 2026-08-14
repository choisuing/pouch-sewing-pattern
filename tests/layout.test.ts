import { describe, expect, it } from 'vitest';
import { buildLayout } from '../src/core/layout';
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
