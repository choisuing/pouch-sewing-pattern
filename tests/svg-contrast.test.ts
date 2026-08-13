import { describe, expect, it } from 'vitest';
import { buildLayout } from '../src/core/layout';
import { paginate } from '../src/core/tiling';
import { renderPreviewSvg } from '../src/ui/preview';
import { renderShapeSvg } from '../src/ui/shape';

/**
 * 미리보기 SVG의 선과 글자가 화면에서 실제로 읽히는지 지킨다.
 * 화면 팔레트를 바꿀 때 여기 배경색 상수도 함께 맞춰야 한다.
 */
const CONTAINER_BG = '#fbf7f0'; // style.css의 --bg. .preview / .shape 배경
const PATTERN_FILL = '#fffdf5'; // 도안 안쪽 채움

/** #abc와 #aabbcc를 모두 받아 6자리로 맞춘다. */
function normalize(hex: string): string {
  const value = hex.replace('#', '');
  return value.length === 3 ? value.split('').map((c) => c + c).join('') : value;
}

/** WCAG 2.x 상대 휘도 */
function luminance(hex: string): number {
  const value = normalize(hex);
  const channels = [0, 2, 4].map((i) => parseInt(value.slice(i, i + 2), 16) / 255);
  const linear = channels.map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * linear[0]! + 0.7152 * linear[1]! + 0.0722 * linear[2]!;
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
}

/** `class="name"`을 가진 요소에서 주어진 속성의 색을 꺼낸다. */
function colorOf(svg: string, className: string, attribute: 'stroke' | 'fill'): string {
  const element = svg.match(new RegExp(`<[^>]*class="${className}"[^>]*>`));
  if (element === null) throw new Error(`${className} 요소를 찾지 못했다`);
  const color = element[0].match(new RegExp(`${attribute}="(#[0-9a-fA-F]{3,6})"`));
  if (color === null) throw new Error(`${className}의 ${attribute} 색을 찾지 못했다`);
  return color[1]!;
}

const layout = buildLayout({ widthMm: 150, heightMm: 90, depthMm: 50 });
const previewSvg = renderPreviewSvg(layout, paginate(layout, 'a4'));
const shapeSvg = renderShapeSvg({ widthMm: 150, heightMm: 90, depthMm: 50 });

describe('전개도 미리보기 — 대비', () => {
  it('페이지 번호 글자가 4.5:1 이상이다', () => {
    expect(contrast(colorOf(previewSvg, 'tile-label', 'fill'), CONTAINER_BG)).toBeGreaterThanOrEqual(4.5);
  });

  it('페이지 경계선이 3:1 이상이다', () => {
    expect(contrast(colorOf(previewSvg, 'page-tile', 'stroke'), CONTAINER_BG)).toBeGreaterThanOrEqual(3);
  });

  it('완성선이 3:1 이상이다', () => {
    expect(contrast(colorOf(previewSvg, 'seam-line', 'stroke'), PATTERN_FILL)).toBeGreaterThanOrEqual(3);
  });

  it('페이지 경계선과 접힘선이 서로 구별될 만큼 다르다', () => {
    const tile = colorOf(previewSvg, 'page-tile', 'stroke');
    const fold = previewSvg.match(/stroke="(#[0-9a-fA-F]{3,6})" stroke-width="1" stroke-dasharray="8 5"/);
    expect(fold?.[1]).toBeDefined();
    expect(contrast(tile, fold![1]!)).toBeGreaterThan(1.4);
  });
});

describe('완성 예상 모습 — 대비', () => {
  it('숨은 모서리가 3:1 이상이다', () => {
    expect(contrast(colorOf(shapeSvg, 'hidden-edge', 'stroke'), PATTERN_FILL)).toBeGreaterThanOrEqual(3);
  });

  it('지퍼선이 3:1 이상이다', () => {
    expect(contrast(colorOf(shapeSvg, 'zipper', 'stroke'), PATTERN_FILL)).toBeGreaterThanOrEqual(3);
  });

  it('치수 글자가 4.5:1 이상이다', () => {
    expect(contrast(colorOf(shapeSvg, 'dim-label', 'fill'), CONTAINER_BG)).toBeGreaterThanOrEqual(4.5);
  });
});
