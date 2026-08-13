import type { Dimensions } from '../core/dimensions';
import { escapeXml } from './preview';

/**
 * 사선 투영(oblique). 앞면은 가로·높이 실제 비율 그대로 그리고,
 * 바닥폭은 이 각도로 물러나게 한다. 앞면이 왜곡되지 않아 파우치가
 * 얼마나 납작한지·높은지가 한눈에 들어온다.
 */
const DEPTH_ANGLE_DEG = 30;

/** 깊이 축소율. 1이면 실제 길이(카발리에), 0.5면 절반(캐비닛). */
const DEPTH_SCALE = 0.6;

/**
 * 여백·글자·선 굵기는 모두 그림의 가로 폭에 비례시킨다. mm 고정값으로 두면
 * 작은 파우치에서는 글자가 그림을 덮고 큰 파우치에서는 읽을 수 없이 작아진다.
 * 화면에서 SVG 폭이 컨테이너에 맞춰지므로 가로 폭이 곧 표시 배율이다.
 */
const PAD_RATIO = 0.15;
const FONT_RATIO = 0.062;
const STROKE_RATIO = 0.009;

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

interface Point {
  readonly x: number;
  readonly y: number;
}

function toPoints(points: readonly Point[]): string {
  return points.map((p) => `${round1(p.x)},${round1(p.y)}`).join(' ');
}

/** a에서 b쪽으로 t만큼 간 지점. */
function lerp(a: Point, b: Point, t: number): Point {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

export function renderShapeSvg(dimensions: Dimensions): string {
  const { widthMm: W, heightMm: H, depthMm: D } = dimensions;

  const radians = (DEPTH_ANGLE_DEG * Math.PI) / 180;
  const dx = D * DEPTH_SCALE * Math.cos(radians);
  const dy = D * DEPTH_SCALE * Math.sin(radians);

  const spanX = W + dx;
  const pad = spanX * PAD_RATIO;
  const font = spanX * FONT_RATIO;
  const stroke = spanX * STROKE_RATIO;
  const rightPad = pad + font * 4;

  // 앞면 좌상단을 기준으로 잡고, 깊이는 오른쪽 위로 물러난다.
  const x0 = pad;
  const y0 = pad + dy;

  const frontTopLeft = { x: x0, y: y0 };
  const frontTopRight = { x: x0 + W, y: y0 };
  const frontBottomRight = { x: x0 + W, y: y0 + H };
  const frontBottomLeft = { x: x0, y: y0 + H };

  const backTopLeft = { x: x0 + dx, y: y0 - dy };
  const backTopRight = { x: x0 + W + dx, y: y0 - dy };
  const backBottomRight = { x: x0 + W + dx, y: y0 + H - dy };
  const backBottomLeft = { x: x0 + dx, y: y0 + H - dy };

  const face = (name: string, points: readonly Point[], fill: string) =>
    `<polygon class="${name}" points="${toPoints(points)}" fill="${fill}" stroke="#222" stroke-width="${round1(stroke)}" stroke-linejoin="round" />`;

  const faces =
    face('face-front', [frontTopLeft, frontTopRight, frontBottomRight, frontBottomLeft], '#fffdf5') +
    face('face-top', [frontTopLeft, backTopLeft, backTopRight, frontTopRight], '#f7f4ea') +
    face('face-side', [frontTopRight, backTopRight, backBottomRight, frontBottomRight], '#efeade');

  // 뒤쪽 아래 모서리는 파우치에 가려 보이지 않는다. 참조 도안처럼 점선으로 비친다.
  const hiddenEdges = [
    [backBottomLeft, backBottomRight],
    [backBottomLeft, backTopLeft],
    [backBottomLeft, frontBottomLeft],
  ]
    .map(([a, b]) => {
      const dash = `${round1(stroke * 3)} ${round1(stroke * 2.2)}`;
      return `<line class="hidden-edge" x1="${round1(a!.x)}" y1="${round1(a!.y)}" x2="${round1(b!.x)}" y2="${round1(b!.y)}" stroke="#858585" stroke-width="${round1(stroke * 0.65)}" stroke-dasharray="${dash}" />`;
    })
    .join('');

  // 지퍼는 윗면 뒤쪽 가장자리를 따라 놓인다. 평행선으로 층을 준다.
  const zipper = [0.16, 0.28, 0.4]
    .map((t) => {
      const a = lerp(backTopLeft, frontTopLeft, t);
      const b = lerp(backTopRight, frontTopRight, t);
      return `<line class="zipper" x1="${round1(a.x)}" y1="${round1(a.y)}" x2="${round1(b.x)}" y2="${round1(b.y)}" stroke="#666" stroke-width="${round1(stroke * 0.55)}" />`;
    })
    .join('');

  const dimLabel = (x: number, y: number, text: string, anchor: string, rotate?: string) =>
    `<text class="dim-label" x="${round1(x)}" y="${round1(y)}" text-anchor="${anchor}" font-size="${round1(font)}" fill="#555"${rotate ?? ''}>${escapeXml(text)}</text>`;

  const heightLabelY = y0 + H / 2;
  const heightLabelX = x0 - font * 0.7;
  const labels =
    dimLabel(x0 + W / 2, y0 + H + font * 1.2, `${round1(W)}mm`, 'middle') +
    dimLabel(
      heightLabelX,
      heightLabelY,
      `${round1(H)}mm`,
      'middle',
      ` transform="rotate(-90 ${round1(heightLabelX)} ${round1(heightLabelY)})"`,
    ) +
    dimLabel(x0 + W + dx + font * 0.4, y0 + H - dy / 2 + font * 0.4, `${round1(D)}mm`, 'start');

  // 오른쪽은 바닥폭 라벨이 앉을 자리를 더 준다. 일반 여백만 두면 "200mm"가 잘린다.
  const viewWidth = spanX + pad + rightPad;
  const viewHeight = H + dy + 2 * pad;

  const label = `가로 ${round1(W)}mm, 높이 ${round1(H)}mm, 바닥폭 ${round1(D)}mm 파우치의 완성 예상 모습`;

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${round1(viewWidth)} ${round1(viewHeight)}"`,
    ` style="max-width: 100%; height: auto;" role="img" aria-label="${escapeXml(label)}">`,
    faces,
    hiddenEdges,
    zipper,
    labels,
    `</svg>`,
  ].join('');
}
