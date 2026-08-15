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

/**
 * 위쪽 여백은 아래보다 좁게 잡는다. 아래에는 가로 치수 글자가 앉지만
 * 위에는 아무것도 없다. 같은 여백을 주면 그만큼 그림만 작아 보인다.
 */
const TOP_PAD_RATIO = 0.04;
const FONT_RATIO = 0.062;
const STROKE_RATIO = 0.006;

/**
 * 지퍼가 윗면 뒤쪽 모서리에서 앞쪽으로 들어온 비율. 앞뒤 지퍼단이
 * D/2 − Z/2씩 맞물리므로 지퍼는 바닥폭의 정중앙에 놓인다.
 */
const ZIPPER_DEPTH = 0.5;

/** 지퍼 색. style.css의 --danger와 같은 값이다. */
const ZIPPER_COLOR = '#b42318';

/** 가려진 왼쪽 옆면을 비추는 정도. */
const HIDDEN_SIDE_OPACITY = 0.3;

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
  const topPad = spanX * TOP_PAD_RATIO;
  const font = spanX * FONT_RATIO;
  const stroke = spanX * STROKE_RATIO;
  const rightPad = pad + font * 4;

  // 앞면 좌상단을 기준으로 잡고, 깊이는 오른쪽 위로 물러난다.
  const x0 = pad;
  const y0 = topPad + dy;

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

  const zipperStroke = round1(stroke * 0.9);

  /*
   * 옆면은 위쪽 절반이 지퍼단 옆날개, 아래쪽 절반이 바닥단 옆날개다.
   * 넓이로 확인하면 D×H = (H/2)×D + 2×(H/2)×(D/2−Z/2) + (H/2)×Z 로 딱 맞는다.
   * 둘의 완성선이 만나는 자리를 긋고, 지퍼도 거기까지 내려온다.
   *
   * 좌우 옆면이 같은 계산을 쓰도록 한 함수로 묶는다. 왼쪽은 파우치에
   * 가려 보이지 않지만, 지퍼가 양 끝에서 똑같이 내려온다는 걸 보여 주려고
   * 흐리게 비춘다. 숨은 모서리를 점선으로 비추는 것과 같은 취지다.
   */
  const sideMarks = (topFront: Point, topBack: Point, suffix: string, opacity?: number) => {
    const fade = opacity === undefined ? '' : ` stroke-opacity="${opacity}"`;
    const zipTop = lerp(topBack, topFront, ZIPPER_DEPTH);
    return (
      `<line class="side-seam${suffix}" x1="${round1(topFront.x)}" y1="${round1(topFront.y + H / 2)}"` +
      ` x2="${round1(topBack.x)}" y2="${round1(topBack.y + H / 2)}"` +
      ` stroke="#222" stroke-width="${round1(stroke * 0.6)}"${fade} />` +
      `<line class="zipper-side${suffix}" x1="${round1(zipTop.x)}" y1="${round1(zipTop.y)}"` +
      ` x2="${round1(zipTop.x)}" y2="${round1(zipTop.y + H / 2)}"` +
      ` stroke="${ZIPPER_COLOR}" stroke-width="${zipperStroke}" stroke-linecap="round"${fade} />`
    );
  };

  const hiddenSide = sideMarks(frontTopLeft, backTopLeft, '-hidden', HIDDEN_SIDE_OPACITY);
  const visibleSide = sideMarks(frontTopRight, backTopRight, '');
  const zipperLeft = lerp(backTopLeft, frontTopLeft, ZIPPER_DEPTH);
  const zipperRight = lerp(backTopRight, frontTopRight, ZIPPER_DEPTH);

  // 지퍼는 윗면 한가운데를 가로지른다.
  const zipper =
    `<line class="zipper" x1="${round1(zipperLeft.x)}" y1="${round1(zipperLeft.y)}"` +
    ` x2="${round1(zipperRight.x)}" y2="${round1(zipperRight.y)}"` +
    ` stroke="${ZIPPER_COLOR}" stroke-width="${zipperStroke}" stroke-linecap="round" />`;

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

  const viewWidth = spanX + pad + rightPad;
  const viewHeight = H + dy + topPad + pad;

  const label = `가로 ${round1(W)}mm, 높이 ${round1(H)}mm, 바닥폭 ${round1(D)}mm 파우치의 완성 예상 모습`;

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${round1(viewWidth)} ${round1(viewHeight)}"`,
    // width를 비우고 viewBox 비율에만 맡기면 WebKit이 flex 안에서 폭을 0으로
    // 계산해 그림이 통째로 사라진다. 폭을 못 박고 높이만 비율대로 따라오게 한다.
    ` style="width: 100%; max-width: 100%; height: auto;" role="img" aria-label="${escapeXml(label)}">`,
    faces,
    hiddenEdges,
    hiddenSide,
    visibleSide,
    zipper,
    labels,
    `</svg>`,
  ].join('');
}
