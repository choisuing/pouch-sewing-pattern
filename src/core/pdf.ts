// PDF 문구는 한국어로 쓴다. pdf-lib 표준 폰트에는 한글 글리프가 없으므로
// 필요한 글자만 담은 Noto Sans KR 서브셋(core/korean-font.ts)을 심어서 쓴다.
// 서브셋에 없는 글자는 그리지 못하니, 문구를 바꿀 때는 서브셋도 다시 만들어야 한다.
import fontkit from '@pdf-lib/fontkit';
import { PDFDocument, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import { KOREAN_BOLD_FONT_BASE64, KOREAN_FONT_BASE64 } from './korean-font';
export { KOREAN_FONT_BASE64 };
import { SEAM_MM } from './constants';
import type { Layout, Line, Point } from './layout';
import { PAGE_MARGIN_MM, PAGE_OVERLAP_MM, type Pagination, type Page } from './tiling';

export const MM_TO_PT = 72 / 25.4;

/**
 * 서브셋 폰트가 담고 있는 글자. PDF에 찍는 문구는 전부 이 안에 있어야 한다.
 * 없는 글자를 쓰면 그 자리가 비어 나오므로, 테스트로 미리 막는다.
 */
export const KOREAN_FONT_CHARS: ReadonlySet<string> = new Set(
  " !()-.0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZcm·×가기높닥도로바성세수안열완요용이인장지치크폭하행확",
);

/** 브라우저와 Node 양쪽에서 도는 base64 디코더. */
function decodeBase64(value: string): Uint8Array {
  if (typeof atob === 'function') {
    const binary = atob(value);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  }
  return Uint8Array.from(Buffer.from(value, 'base64'));
}

/** 축척 확인용 정사각형 한 변 (mm). 인쇄 후 자로 재는 기준. */
export const SCALE_SQUARE_MM = 30;

/** 빨간 사각형 옆에 붙는 문구. */
export const SCALE_SQUARE_LABEL = '3cm 확인하세요!';

/** 도안 장마다 아래쪽에 넣는 강조 문구. 굵은 서브셋 폰트로 그린다. */
export const PATTERN_NOTE = "'실제사이즈'로 출력해주세요!";

/** 굵은 서브셋 폰트가 담고 있는 글자. PATTERN_NOTE만 그릴 수 있다. */
export const KOREAN_BOLD_FONT_CHARS: ReadonlySet<string> = new Set(" '!로사세실요이제주즈출력해");

/**
 * 도안 하단 문구의 기준점 (mm). 가로 가운데, 인쇄 영역 바깥 아래쪽 여백에 둔다.
 * 도안은 사방 여백 안쪽에만 그려지므로 이 자리는 도면과 절대 겹치지 않는다.
 */
export function patternNotePointMm(pagination: Pagination): { xMm: number; yMm: number } {
  return {
    xMm: pagination.pageWidthMm / 2,
    yMm: pagination.pageHeightMm - PAGE_MARGIN_MM + 5.5,
  };
}

const CUT_COLOR = rgb(0, 0, 0);
const FOLD_COLOR = rgb(0.55, 0.55, 0.55);
const MARK_COLOR = rgb(0.2, 0.2, 0.2);
const SEAM_COLOR = rgb(0.3, 0.3, 0.3);
const SCALE_COLOR = rgb(0.85, 0.1, 0.1);

interface PageContext {
  readonly pdfPage: PDFPage;
  readonly pagination: Pagination;
  readonly page: Page;
}

/**
 * 페이지 프레임 좌표(mm, 페이지 자체 기준) → PDF 좌표(pt).
 * 전개도 원점 오프셋 없이 y축 뒤집기(페이지 좌상단 원점 → PDF 좌하단 원점)만 적용한다.
 * 이 파일에서 y 반전식은 이 함수 안에만 있고, 나머지 좌표 계산은 모두 이 함수
 * (또는 이를 감싸는 toPagePoint)를 통과한다.
 */
export function toFramePoint(pagination: Pagination, xMm: number, yMm: number): { x: number; y: number } {
  return {
    x: xMm * MM_TO_PT,
    y: (pagination.pageHeightMm - yMm) * MM_TO_PT,
  };
}

/** 전개도 좌표(mm) → PDF 좌표(pt). 페이지 원점 오프셋을 얹은 뒤 toFramePoint로 뒤집는다. */
export function toPagePoint(pagination: Pagination, page: Page, xMm: number, yMm: number): { x: number; y: number } {
  const localXMm = xMm - page.originXMm + PAGE_MARGIN_MM;
  const localYMm = yMm - page.originYMm + PAGE_MARGIN_MM;
  return toFramePoint(pagination, localXMm, localYMm);
}

function drawPolygon(ctx: PageContext, points: readonly Point[], thickness: number) {
  for (let i = 0; i < points.length; i++) {
    const a = points[i]!;
    const b = points[(i + 1) % points.length]!;
    ctx.pdfPage.drawLine({
      start: toPagePoint(ctx.pagination, ctx.page, a.xMm, a.yMm),
      end: toPagePoint(ctx.pagination, ctx.page, b.xMm, b.yMm),
      thickness,
      color: CUT_COLOR,
    });
  }
}

/** 완성선. 접힘선(회색 긴 점선)과 헷갈리지 않도록 더 진하고 촘촘한 점선으로 긋는다. */
function drawSeamLine(ctx: PageContext, points: readonly Point[]) {
  for (let i = 0; i < points.length; i++) {
    const a = points[i]!;
    const b = points[(i + 1) % points.length]!;
    ctx.pdfPage.drawLine({
      start: toPagePoint(ctx.pagination, ctx.page, a.xMm, a.yMm),
      end: toPagePoint(ctx.pagination, ctx.page, b.xMm, b.yMm),
      thickness: 0.4,
      color: SEAM_COLOR,
      dashArray: [2, 2],
    });
  }
}

function drawFoldLine(ctx: PageContext, line: Line) {
  ctx.pdfPage.drawLine({
    start: toPagePoint(ctx.pagination, ctx.page, line.x1Mm, line.y1Mm),
    end: toPagePoint(ctx.pagination, ctx.page, line.x2Mm, line.y2Mm),
    thickness: 0.5,
    color: FOLD_COLOR,
    dashArray: [4, 4],
  });
}

function drawAlignmentMarks(ctx: PageContext, font: PDFFont) {
  const { pagination, page } = ctx;
  const armPt = 4 * MM_TO_PT;
  const corners: readonly { xMm: number; yMm: number }[] = [
    { xMm: PAGE_MARGIN_MM, yMm: PAGE_MARGIN_MM },
    { xMm: pagination.pageWidthMm - PAGE_MARGIN_MM, yMm: PAGE_MARGIN_MM },
    { xMm: PAGE_MARGIN_MM, yMm: pagination.pageHeightMm - PAGE_MARGIN_MM },
    { xMm: pagination.pageWidthMm - PAGE_MARGIN_MM, yMm: pagination.pageHeightMm - PAGE_MARGIN_MM },
  ];

  for (const corner of corners) {
    const { x, y } = toFramePoint(pagination, corner.xMm, corner.yMm);
    ctx.pdfPage.drawLine({
      start: { x: x - armPt, y },
      end: { x: x + armPt, y },
      thickness: 0.5,
      color: MARK_COLOR,
    });
    ctx.pdfPage.drawLine({
      start: { x, y: y - armPt },
      end: { x, y: y + armPt },
      thickness: 0.5,
      color: MARK_COLOR,
    });
  }

  const labelPoint = toFramePoint(pagination, PAGE_MARGIN_MM + 2, PAGE_MARGIN_MM + 6);
  ctx.pdfPage.drawText(page.gridLabel, {
    x: labelPoint.x,
    y: labelPoint.y,
    size: 12,
    font,
    color: MARK_COLOR,
  });
}

/**
 * 축척 확인용 사각형의 위치와 크기 (mm). 안내 페이지 오른쪽 위에 놓는다.
 * 안내 문구는 왼쪽에 짧게 깔리므로 이 자리가 비어 있다.
 */
export function scaleSquareRectMm(pagination: Pagination): {
  xMm: number;
  yMm: number;
  sizeMm: number;
} {
  return {
    xMm: pagination.pageWidthMm - PAGE_MARGIN_MM - 4 - SCALE_SQUARE_MM,
    yMm: PAGE_MARGIN_MM + 8,
    sizeMm: SCALE_SQUARE_MM,
  };
}

/**
 * 배율 100%로 인쇄됐는지 자로 확인하는 사각형. 도면 선과 헷갈리지 않도록
 * 빨간색으로만 그린다.
 */
/** 도안 장 아래쪽 강조 문구. 실치수로 뽑아야 한다는 걸 인쇄물에서도 알 수 있게 한다. */
function drawPatternNote(ctx: PageContext, boldFont: PDFFont) {
  const { pagination } = ctx;
  const point = patternNotePointMm(pagination);
  const size = 9;
  const widthPt = boldFont.widthOfTextAtSize(PATTERN_NOTE, size);
  const anchor = toFramePoint(pagination, point.xMm, point.yMm);

  ctx.pdfPage.drawText(PATTERN_NOTE, {
    x: anchor.x - widthPt / 2,
    y: anchor.y,
    size,
    font: boldFont,
    color: SCALE_COLOR,
  });
}

function drawScaleSquare(page: PDFPage, pagination: Pagination, font: PDFFont) {
  const rect = scaleSquareRectMm(pagination);
  const topLeft = toFramePoint(pagination, rect.xMm, rect.yMm);

  page.drawRectangle({
    x: topLeft.x,
    y: topLeft.y - rect.sizeMm * MM_TO_PT,
    width: rect.sizeMm * MM_TO_PT,
    height: rect.sizeMm * MM_TO_PT,
    borderColor: SCALE_COLOR,
    borderWidth: 1,
  });

  page.drawText(SCALE_SQUARE_LABEL, {
    x: rect.xMm * MM_TO_PT,
    y: topLeft.y + 3,
    size: 9,
    font,
    color: SCALE_COLOR,
  });
}

const ORIENTATION_LABELS: Record<Pagination['orientation'], string> = {
  portrait: '세로',
  landscape: '가로',
};

/**
 * 안내 페이지 문구. 치수만 적는다. 인쇄 방법 설명은 넣지 않는다 —
 * 빨간 3cm 사각형과 그 라벨만으로 배율 확인은 전달된다.
 *
 * 여기 쓰는 글자는 반드시 KOREAN_FONT_CHARS 안에 있어야 한다.
 */
export function guidePageLines(layout: Layout, pagination: Pagination): readonly string[] {
  const { widthMm: W, depthMm: D, heightMm: H } = layout.dimensions;
  const orientation = ORIENTATION_LABELS[pagination.orientation];
  return [
    `완성 치수   가로 ${W} · 높이 ${H} · 바닥폭 ${D}mm`,
    `도안 크기   ${round1(layout.totalWidthMm)} × ${round1(layout.totalHeightMm)}mm`,
    `용지        ${pagination.paper.toUpperCase()} ${orientation} ${pagination.pages.length}장 (${pagination.cols}열 × ${pagination.rows}행)`,
  ];
}

/** 축소도가 시작하는 y. 치수 세 줄과 빨간 사각형 아래에서 시작한다. */
const THUMBNAIL_TOP_MM = PAGE_MARGIN_MM + 8 + SCALE_SQUARE_MM + 10;

/**
 * 안내 페이지 아래쪽 전체 배치 축소도의 자리 (mm).
 * 폭만 보고 배율을 정하면 세로로 긴 도안에서 페이지 밖으로 넘친다.
 * 가로·세로 중 더 빡빡한 쪽에 맞추고 비율은 그대로 둔다.
 */
export function guideThumbnailRectMm(
  layout: Layout,
  pagination: Pagination,
): { xMm: number; yMm: number; widthMm: number; heightMm: number } {
  const leftMm = PAGE_MARGIN_MM + 6;
  const availableWidthMm = pagination.pageWidthMm - 2 * leftMm;
  const availableHeightMm = pagination.pageHeightMm - THUMBNAIL_TOP_MM - PAGE_MARGIN_MM;

  const scale = Math.min(
    availableWidthMm / layout.totalWidthMm,
    availableHeightMm / layout.totalHeightMm,
  );

  return {
    xMm: leftMm,
    yMm: THUMBNAIL_TOP_MM,
    widthMm: layout.totalWidthMm * scale,
    heightMm: layout.totalHeightMm * scale,
  };
}

function drawGuidePage(
  doc: PDFDocument,
  layout: Layout,
  pagination: Pagination,
  font: PDFFont,
) {
  const page = doc.addPage([
    pagination.pageWidthMm * MM_TO_PT,
    pagination.pageHeightMm * MM_TO_PT,
  ]);
  drawScaleSquare(page, pagination, font);

  const lines = guidePageLines(layout, pagination);

  let yMm = PAGE_MARGIN_MM + 12;
  for (const line of lines) {
    const point = toFramePoint(pagination, PAGE_MARGIN_MM + 6, yMm);
    page.drawText(line, {
      x: point.x,
      y: point.y,
      size: 11,
      font,
      color: CUT_COLOR,
    });
    yMm += 8;
  }

  // 전체 배치 축소도 — 페이지 격자와 전개도 외곽선
  const thumbnail = guideThumbnailRectMm(layout, pagination);
  const scale = thumbnail.widthMm / layout.totalWidthMm;
  const originYMm = thumbnail.yMm;

  for (const tile of pagination.pages) {
    const rectXMm = thumbnail.xMm + tile.originXMm * scale;
    const wMm = Math.min(pagination.contentWidthMm, layout.totalWidthMm - tile.originXMm) * scale;
    const hMm = Math.min(pagination.contentHeightMm, layout.totalHeightMm - tile.originYMm) * scale;
    const yTopMm = originYMm + tile.originYMm * scale;
    const bottomLeft = toFramePoint(pagination, rectXMm, yTopMm + hMm);
    page.drawRectangle({
      x: bottomLeft.x,
      y: bottomLeft.y,
      width: wMm * MM_TO_PT,
      height: hMm * MM_TO_PT,
      borderColor: FOLD_COLOR,
      borderWidth: 0.5,
    });
    const labelPoint = toFramePoint(pagination, rectXMm, yTopMm + 5);
    page.drawText(tile.gridLabel, {
      x: labelPoint.x + 3,
      y: labelPoint.y,
      size: 7,
      font,
      color: MARK_COLOR,
    });
  }

  for (let i = 0; i < layout.outlineMm.length; i++) {
    const a = layout.outlineMm[i]!;
    const b = layout.outlineMm[(i + 1) % layout.outlineMm.length]!;
    page.drawLine({
      start: toFramePoint(pagination, thumbnail.xMm + a.xMm * scale, originYMm + a.yMm * scale),
      end: toFramePoint(pagination, thumbnail.xMm + b.xMm * scale, originYMm + b.yMm * scale),
      thickness: 0.8,
      color: CUT_COLOR,
    });
  }
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

export async function buildPdf(layout: Layout, pagination: Pagination): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const font = await doc.embedFont(decodeBase64(KOREAN_FONT_BASE64));
  const boldFont = await doc.embedFont(decodeBase64(KOREAN_BOLD_FONT_BASE64));

  drawGuidePage(doc, layout, pagination, font);

  for (const page of pagination.pages) {
    const pdfPage = doc.addPage([
      pagination.pageWidthMm * MM_TO_PT,
      pagination.pageHeightMm * MM_TO_PT,
    ]);
    const ctx: PageContext = { pdfPage, pagination, page };

    drawPolygon(ctx, layout.outlineMm, 1);
    drawSeamLine(ctx, layout.seamLineMm);
    for (const line of layout.foldLinesMm) drawFoldLine(ctx, line);
    for (const band of layout.bands) {
      if (band.yMm === 0) continue;
      drawFoldLine(ctx, {
        x1Mm: band.xMm,
        y1Mm: band.yMm,
        x2Mm: band.xMm + band.widthMm,
        y2Mm: band.yMm,
      });
    }

    drawAlignmentMarks(ctx, font);
    drawPatternNote(ctx, boldFont);
  }

  return doc.save();
}
