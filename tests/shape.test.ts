import { describe, expect, it } from 'vitest';
import { renderShapeSvg } from '../src/ui/shape';
import type { Dimensions } from '../src/core/dimensions';

const cosmetic: Dimensions = { widthMm: 150, heightMm: 90, depthMm: 50 };
const pencil: Dimensions = { widthMm: 200, heightMm: 50, depthMm: 50 };

function frontFace(svg: string): { widthMm: number; heightMm: number } {
  const match = svg.match(/class="face-front"[^>]*points="([^"]*)"/);
  if (match?.[1] === undefined) throw new Error('앞면을 찾지 못했다');
  const points = match[1].split(' ').map((pair) => {
    const [x, y] = pair.split(',').map(Number);
    return { x: x!, y: y! };
  });
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  return {
    widthMm: Math.max(...xs) - Math.min(...xs),
    heightMm: Math.max(...ys) - Math.min(...ys),
  };
}

describe('renderShapeSvg', () => {
  it('svg 요소를 만든다', () => {
    expect(renderShapeSvg(cosmetic)).toMatch(/^<svg /);
    expect(renderShapeSvg(cosmetic)).toMatch(/<\/svg>$/);
  });

  it('앞면이 가로·높이 실제 비율을 그대로 쓴다', () => {
    const face = frontFace(renderShapeSvg(cosmetic));
    expect(face.widthMm / face.heightMm).toBeCloseTo(150 / 90, 6);
  });

  it('납작한 파우치와 도톰한 파우치의 앞면 비율이 다르다', () => {
    const flat = frontFace(renderShapeSvg(pencil));
    const tall = frontFace(renderShapeSvg(cosmetic));
    expect(flat.widthMm / flat.heightMm).toBeGreaterThan(tall.widthMm / tall.heightMm);
  });

  it('바닥폭이 클수록 깊이 방향으로 더 멀리 물러난다', () => {
    const shallow = renderShapeSvg({ widthMm: 150, heightMm: 90, depthMm: 50 });
    const deep = renderShapeSvg({ widthMm: 150, heightMm: 90, depthMm: 200 });
    const widthOf = (svg: string) => Number(svg.match(/viewBox="[^"]*? ([\d.]+) [\d.]+"/)![1]);
    expect(widthOf(deep)).toBeGreaterThan(widthOf(shallow));
  });

  it('앞면·윗면·옆면 세 면을 그린다', () => {
    const svg = renderShapeSvg(cosmetic);
    for (const face of ['face-front', 'face-top', 'face-side']) {
      expect(svg).toContain(`class="${face}"`);
    }
  });

  it('숨은 모서리를 점선으로 그린다', () => {
    expect(renderShapeSvg(cosmetic)).toMatch(/class="hidden-edge"[^>]*stroke-dasharray/);
  });

  it('지퍼단을 표시한다', () => {
    expect(renderShapeSvg(cosmetic)).toContain('class="zipper"');
  });

  it('세 치수를 mm 라벨로 붙인다', () => {
    const svg = renderShapeSvg(cosmetic);
    expect(svg).toContain('150mm');
    expect(svg).toContain('90mm');
    expect(svg).toContain('50mm');
  });

  it('소수점 치수를 첫째 자리까지만 적는다', () => {
    const svg = renderShapeSvg({ widthMm: 150, heightMm: 90, depthMm: 95 });
    expect(svg).toContain('95mm');
    expect(svg).not.toMatch(/\d\.\d\d/);
  });

  it('그림 설명을 aria-label로 제공한다', () => {
    expect(renderShapeSvg(cosmetic)).toMatch(/aria-label="[^"]+"/);
  });
});

describe('renderShapeSvg — 크기에 따른 일관성', () => {
  const viewWidth = (svg: string) => Number(svg.match(/viewBox="[^"]*? ([\d.]+) [\d.]+"/)![1]);
  const fontSize = (svg: string) => Number(svg.match(/class="dim-label"[^>]*font-size="([\d.]+)"/)![1]);

  it('작은 파우치와 큰 파우치의 글자 크기가 그림에 비례한다', () => {
    const small = renderShapeSvg({ widthMm: 100, heightMm: 50, depthMm: 40 });
    const large = renderShapeSvg({ widthMm: 400, heightMm: 300, depthMm: 200 });

    const smallRatio = fontSize(small) / viewWidth(small);
    const largeRatio = fontSize(large) / viewWidth(large);
    expect(largeRatio).toBeCloseTo(smallRatio, 2);
  });

  it('여백도 그림 크기에 비례한다', () => {
    const small = renderShapeSvg({ widthMm: 100, heightMm: 50, depthMm: 40 });
    const large = renderShapeSvg({ widthMm: 400, heightMm: 300, depthMm: 200 });

    // 앞면 왼쪽 변이 viewBox 폭에서 차지하는 비율이 같아야 한다.
    const leftEdge = (svg: string) =>
      Number(svg.match(/class="face-front"[^>]*points="([\d.]+),/)![1]) / viewWidth(svg);
    expect(leftEdge(large)).toBeCloseTo(leftEdge(small), 2);
  });
});

describe('renderShapeSvg — 라벨이 그림 밖으로 넘치지 않는다', () => {
  const viewBox = (svg: string) => {
    const [, , w, h] = svg.match(/viewBox="([\d.]+) ([\d.]+) ([\d.]+) ([\d.]+)"/)!.slice(1).map(Number);
    return { width: w!, height: h! };
  };

  it('바닥폭 라벨이 오른쪽 끝을 넘지 않는다', () => {
    for (const dims of [
      { widthMm: 150, heightMm: 90, depthMm: 50 },
      { widthMm: 400, heightMm: 300, depthMm: 200 },
      { widthMm: 100, heightMm: 300, depthMm: 40 },
    ]) {
      const svg = renderShapeSvg(dims);
      const { width } = viewBox(svg);
      const font = Number(svg.match(/class="dim-label"[^>]*font-size="([\d.]+)"/)![1]);
      // 바닥폭 라벨은 text-anchor="start"이므로 마지막에 그려진 라벨의 x가 시작점.
      const labels = [...svg.matchAll(/class="dim-label" x="([\d.]+)"/g)].map((m) => Number(m[1]));
      const depthLabelX = labels[labels.length - 1]!;
      // "200mm" 다섯 글자가 들어갈 자리는 남아 있어야 한다.
      expect(width - depthLabelX).toBeGreaterThan(font * 3.2);
    }
  });

  it('모든 라벨이 viewBox 안에 있다', () => {
    const svg = renderShapeSvg({ widthMm: 150, heightMm: 90, depthMm: 50 });
    const { width, height } = viewBox(svg);
    for (const m of svg.matchAll(/class="dim-label" x="([\d.]+)" y="([\d.]+)"/g)) {
      expect(Number(m[1])).toBeGreaterThan(0);
      expect(Number(m[1])).toBeLessThan(width);
      expect(Number(m[2])).toBeGreaterThan(0);
      expect(Number(m[2])).toBeLessThan(height);
    }
  });
});

describe('renderShapeSvg — 지퍼 위치 안내', () => {
  it('지퍼가 어디인지 글자로 알려준다', () => {
    const svg = renderShapeSvg(cosmetic);
    expect(svg).toContain('class="zipper-label"');
    expect(svg).toContain('여기가 지퍼');
  });

  it('지퍼 라벨이 그림 위쪽에 놓인다', () => {
    const svg = renderShapeSvg(cosmetic);
    const label = Number(svg.match(/class="zipper-label"[^>]*y="([\d.]+)"/)![1]);
    const front = Number(svg.match(/class="face-front" points="[\d.]+,([\d.]+)/)![1]);
    expect(label).toBeLessThan(front);
  });
});
