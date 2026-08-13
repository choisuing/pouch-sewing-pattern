import { describe, expect, it } from 'vitest';
import { buildLayout } from '../src/core/layout';
import { SEAM_MM } from '../src/core/constants';
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

  it('접힘선이 좌우 2개이며 전체 높이를 관통한다', () => {
    expect(layout.foldLinesMm).toHaveLength(2);
    for (const line of layout.foldLinesMm) {
      expect(line.x1Mm).toBe(line.x2Mm);
      expect(line.y1Mm).toBe(0);
      expect(line.y2Mm).toBe(layout.totalHeightMm);
    }
    expect(layout.foldLinesMm.map((l) => l.x1Mm)).toEqual([70, 360]);
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
