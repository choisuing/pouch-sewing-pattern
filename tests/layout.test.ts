import { describe, expect, it } from 'vitest';
import { buildLayout } from '../src/core/layout';
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
