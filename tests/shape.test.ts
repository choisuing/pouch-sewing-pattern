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

describe('renderShapeSvg — WebKit 크기 계산', () => {
  /*
   * viewBox만 주고 width를 비우면 WebKit(iOS사파리)이 flex 안에서
   * 폭을 0으로 계산해 그림이 통째로 사라진다. Chromium·Firefox는
   * viewBox 비율로 알아서 잡아 주기 때문에 데스크톱에서는 드러나지 않는다.
   */
  it('폭을 명시해 WebKit이 0으로 계산하지 않게 한다', () => {
    const svg = renderShapeSvg(pencil);
    const style = svg.match(/<svg[^>]*style="([^"]*)"/)![1]!;
    expect(style).toMatch(/(^|;)\s*width:\s*100%/);
  });

  it('높이는 비율대로 따라오게 둔다', () => {
    const style = renderShapeSvg(pencil).match(/<svg[^>]*style="([^"]*)"/)![1]!;
    expect(style).toMatch(/height:\s*auto/);
  });
});

describe('renderShapeSvg — 지퍼가 옆면으로 이어진다', () => {
  /*
   * 지퍼단은 W + H 폭이고 윗면은 W뿐이라, 남는 H가 좌우 H/2씩 옆면으로
   * 넘어간다. 옆면 위쪽 절반이 지퍼단이고 지퍼는 그 한가운데를 세로로
   * H/2만큼 내려온다. 왼쪽 옆면은 파우치에 가려 그리지 않는다.
   */
  const lines = (svg: string, cls: string) =>
    [...svg.matchAll(new RegExp(`class="${cls}"[^>]*x1="([\\d.-]+)" y1="([\\d.-]+)" x2="([\\d.-]+)" y2="([\\d.-]+)"`, 'g'))]
      .map((m) => ({ x1: Number(m[1]), y1: Number(m[2]), x2: Number(m[3]), y2: Number(m[4]) }));

  it('윗면 지퍼 줄 수만큼 옆면에도 이어진다', () => {
    const svg = renderShapeSvg(pencil);
    expect(lines(svg, 'zipper-side')).toHaveLength(lines(svg, 'zipper').length);
  });

  it('옆면 지퍼가 윗면 지퍼의 오른쪽 끝에서 시작한다', () => {
    const svg = renderShapeSvg(pencil);
    const top = lines(svg, 'zipper');
    const side = lines(svg, 'zipper-side');
    for (let i = 0; i < top.length; i++) {
      expect(side[i]!.x1).toBeCloseTo(top[i]!.x2, 1);
      expect(side[i]!.y1).toBeCloseTo(top[i]!.y2, 1);
    }
  });

  it('옆면 지퍼가 세로로 높이의 절반만큼 내려온다', () => {
    for (const dims of [pencil, cosmetic]) {
      for (const line of lines(renderShapeSvg(dims), 'zipper-side')) {
        expect(line.x1).toBeCloseTo(line.x2, 6);
        expect(line.y2 - line.y1).toBeCloseTo(dims.heightMm / 2, 1);
      }
    }
  });

  it('옆면 지퍼가 옆면 밖으로 나가지 않는다', () => {
    for (const dims of [pencil, cosmetic]) {
      const svg = renderShapeSvg(dims);
      const side = svg.match(/class="face-side" points="([^"]*)"/)![1]!
        .split(' ').map((p) => { const [x, y] = p.split(',').map(Number); return { x: x!, y: y! }; });
      const xs = side.map((p) => p.x);
      const ys = side.map((p) => p.y);
      for (const line of lines(svg, 'zipper-side')) {
        expect(line.x1).toBeGreaterThanOrEqual(Math.min(...xs));
        expect(line.x1).toBeLessThanOrEqual(Math.max(...xs));
        expect(line.y2).toBeLessThanOrEqual(Math.max(...ys));
      }
    }
  });
});

describe('renderShapeSvg — 지퍼는 빨간 한 줄이다', () => {
  const lineList = (svg: string, cls: string) =>
    [...svg.matchAll(new RegExp(`class="${cls}"[^>]*x1="([\\d.-]+)" y1="([\\d.-]+)" x2="([\\d.-]+)" y2="([\\d.-]+)"[^>]*stroke="(#[0-9a-fA-F]{3,6})"`, 'g'))]
      .map((m) => ({ x1: Number(m[1]), y1: Number(m[2]), x2: Number(m[3]), y2: Number(m[4]), stroke: m[5]! }));

  it('윗면과 옆면에 각각 한 줄씩만 있다', () => {
    const svg = renderShapeSvg(pencil);
    expect(lineList(svg, 'zipper')).toHaveLength(1);
    expect(lineList(svg, 'zipper-side')).toHaveLength(1);
  });

  it('두 줄 모두 빨간색이다', () => {
    const svg = renderShapeSvg(pencil);
    expect(lineList(svg, 'zipper')[0]!.stroke).toBe('#b42318');
    expect(lineList(svg, 'zipper-side')[0]!.stroke).toBe('#b42318');
  });

  it('윗면 지퍼가 바닥폭 한가운데에 놓인다', () => {
    // 앞뒤 지퍼단이 D/2 - Z/2씩 맞물리므로 지퍼는 윗면 깊이의 정중앙이다.
    for (const dims of [pencil, cosmetic]) {
      const svg = renderShapeSvg(dims);
      const top = svg.match(/class="face-top" points="([^"]*)"/)![1]!
        .split(' ').map((p) => { const [x, y] = p.split(',').map(Number); return { x: x!, y: y! }; });
      const ys = top.map((p) => p.y);
      const middle = (Math.min(...ys) + Math.max(...ys)) / 2;
      expect(lineList(svg, 'zipper')[0]!.y1).toBeCloseTo(middle, 1);
    }
  });
});

describe('renderShapeSvg — 옆면 완성선', () => {
  /*
   * 옆면 위쪽 절반은 지퍼단 옆날개, 아래쪽 절반은 바닥단 옆날개다.
   * 둘의 완성선이 만나는 자리가 옆면 높이의 정확히 절반이고,
   * 옆면 지퍼가 내려와 끝나는 지점도 같은 선이다.
   */
  const seamOf = (svg: string) => {
    const m = svg.match(/class="side-seam"[^>]*x1="([\d.-]+)" y1="([\d.-]+)" x2="([\d.-]+)" y2="([\d.-]+)"/);
    if (m === null) throw new Error('옆면 완성선을 찾지 못했다');
    return { x1: Number(m[1]), y1: Number(m[2]), x2: Number(m[3]), y2: Number(m[4]) };
  };
  const corners = (svg: string, cls: string) =>
    svg.match(new RegExp(`class="${cls}" points="([^"]*)"`))![1]!
      .split(' ').map((p) => { const [x, y] = p.split(',').map(Number); return { x: x!, y: y! }; });

  it('옆면 앞뒤 모서리를 잇는다', () => {
    for (const dims of [pencil, cosmetic]) {
      const svg = renderShapeSvg(dims);
      const [frontTop, backTop] = corners(svg, 'face-side');
      const seam = seamOf(svg);
      expect(seam.x1).toBeCloseTo(frontTop!.x, 1);
      expect(seam.x2).toBeCloseTo(backTop!.x, 1);
    }
  });

  it('옆면 위 모서리에서 높이의 절반만큼 내려온 자리다', () => {
    for (const dims of [pencil, cosmetic]) {
      const svg = renderShapeSvg(dims);
      const [frontTop, backTop] = corners(svg, 'face-side');
      const seam = seamOf(svg);
      expect(seam.y1 - frontTop!.y).toBeCloseTo(dims.heightMm / 2, 1);
      expect(seam.y2 - backTop!.y).toBeCloseTo(dims.heightMm / 2, 1);
    }
  });

  it('옆면 지퍼가 이 선에서 끝난다', () => {
    for (const dims of [pencil, cosmetic]) {
      const svg = renderShapeSvg(dims);
      const zip = svg.match(/class="zipper-side"[^>]*x2="([\d.-]+)" y2="([\d.-]+)"/)!;
      const [zx, zy] = [Number(zip[1]), Number(zip[2])];
      const seam = seamOf(svg);
      // 끝점이 완성선 위에 있는지: 두 끝점과 이룬 삼각형 넓이가 0
      const area = (seam.x2 - seam.x1) * (zy! - seam.y1) - (zx! - seam.x1) * (seam.y2 - seam.y1);
      expect(area).toBeCloseTo(0, 1);
    }
  });

  it('검정 실선이라 지퍼와 구별된다', () => {
    const svg = renderShapeSvg(pencil);
    expect(svg).toMatch(/class="side-seam"[^>]*stroke="#222"/);
    expect(svg).not.toMatch(/class="side-seam"[^>]*stroke-dasharray/);
  });
});

describe('renderShapeSvg — 반대편(가려진) 옆면', () => {
  /*
   * 왼쪽 옆면은 파우치에 가려 보이지 않지만, 지퍼가 양 끝에서 똑같이
   * 내려온다는 걸 보여 주려고 흐리게 비춘다. 숨은 모서리 점선과 같은 취지다.
   */
  const lineOf = (svg: string, cls: string) => {
    const m = svg.match(new RegExp(`class="${cls}"[^>]*x1="([\\d.-]+)" y1="([\\d.-]+)" x2="([\\d.-]+)" y2="([\\d.-]+)"[^>]*?(?:stroke-opacity="([\\d.]+)")?\\s*/>`));
    if (m === null) throw new Error(`${cls}를 찾지 못했다`);
    return { x1: Number(m[1]), y1: Number(m[2]), x2: Number(m[3]), y2: Number(m[4]), opacity: m[5] };
  };

  it('반대편에도 완성선과 지퍼 내림선이 있다', () => {
    const svg = renderShapeSvg(pencil);
    expect(svg).toContain('class="side-seam-hidden"');
    expect(svg).toContain('class="zipper-side-hidden"');
  });

  it('둘 다 30% 투명도로 흐리다', () => {
    const svg = renderShapeSvg(pencil);
    expect(lineOf(svg, 'side-seam-hidden').opacity).toBe('0.3');
    expect(lineOf(svg, 'zipper-side-hidden').opacity).toBe('0.3');
  });

  it('보이는 쪽은 흐리지 않다', () => {
    const svg = renderShapeSvg(pencil);
    expect(lineOf(svg, 'side-seam').opacity).toBeUndefined();
    expect(lineOf(svg, 'zipper-side').opacity).toBeUndefined();
  });

  it('왼쪽 옆면 위 모서리에서 높이의 절반만큼 내려온 자리다', () => {
    for (const dims of [pencil, cosmetic]) {
      const svg = renderShapeSvg(dims);
      const front = svg.match(/class="face-front" points="([^"]*)"/)![1]!.split(' ')[0]!.split(',').map(Number);
      const seam = lineOf(svg, 'side-seam-hidden');
      // 앞면 좌상단이 곧 왼쪽 옆면의 앞쪽 위 모서리다
      expect(seam.x1).toBeCloseTo(front[0]!, 1);
      expect(seam.y1 - front[1]!).toBeCloseTo(dims.heightMm / 2, 1);
    }
  });

  it('반대편 지퍼도 그 완성선에서 끝난다', () => {
    for (const dims of [pencil, cosmetic]) {
      const svg = renderShapeSvg(dims);
      const seam = lineOf(svg, 'side-seam-hidden');
      const zip = lineOf(svg, 'zipper-side-hidden');
      const area = (seam.x2 - seam.x1) * (zip.y2 - seam.y1) - (zip.x2 - seam.x1) * (seam.y2 - seam.y1);
      expect(area).toBeCloseTo(0, 1);
    }
  });
});
