// PDF 안내 문구는 영문만 쓴다. pdf-lib 표준 폰트에 한글 글리프가 없어
// drawText가 "WinAnsi cannot encode" 오류를 던지고, 한글 폰트를 번들하면
// 외부 의존 0 원칙과 산출물 크기에 어긋난다. 한국어 안내는 화면(UI)에서 제공한다.
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import { SEAM_MM } from './constants';
import type { Layout, Line, Point } from './layout';
import { PAGE_MARGIN_MM, PAGE_OVERLAP_MM, type Pagination, type Page } from './tiling';

export const MM_TO_PT = 72 / 25.4;

/** 축척 검증용 눈금자 길이 (mm) */
export const RULER_LENGTH_MM = 50;

const CUT_COLOR = rgb(0, 0, 0);
const FOLD_COLOR = rgb(0.55, 0.55, 0.55);
const MARK_COLOR = rgb(0.2, 0.2, 0.2);
const SEAM_COLOR = rgb(0.3, 0.3, 0.3);

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

function drawRuler(ctx: PageContext, font: PDFFont) {
  const { pagination } = ctx;
  const startXMm = PAGE_MARGIN_MM + 4;
  const yMm = pagination.pageHeightMm - PAGE_MARGIN_MM - 4;
  const start = toFramePoint(pagination, startXMm, yMm);
  const end = toFramePoint(pagination, startXMm + RULER_LENGTH_MM, yMm);

  ctx.pdfPage.drawLine({
    start,
    end,
    thickness: 1,
    color: MARK_COLOR,
  });
  for (const tickXMm of [startXMm, startXMm + RULER_LENGTH_MM]) {
    const tickStart = toFramePoint(pagination, tickXMm, yMm);
    ctx.pdfPage.drawLine({
      start: tickStart,
      end: { x: tickStart.x, y: tickStart.y + 3 * MM_TO_PT },
      thickness: 1,
      color: MARK_COLOR,
    });
  }
  ctx.pdfPage.drawText(`${RULER_LENGTH_MM}mm`, {
    x: (startXMm + RULER_LENGTH_MM + 3) * MM_TO_PT,
    y: start.y - 1,
    size: 8,
    font,
    color: MARK_COLOR,
  });
}

const GUIDE_TITLE = 'BOX POUCH PATTERN';

/**
 * 안내 페이지 문구. pdf-lib 표준 폰트가 한글 글리프를 갖고 있지 않으므로
 * ASCII만 쓴다. 한국어 안내는 화면(UI)에서 제공한다.
 */
export function guidePageLines(layout: Layout, pagination: Pagination): readonly string[] {
  const { widthMm: W, depthMm: D, heightMm: H } = layout.dimensions;
  return [
    GUIDE_TITLE,
    '',
    `Finished  W ${W} x D ${D} x H ${H} mm`,
    `Pattern   ${round1(layout.totalWidthMm)} x ${round1(layout.totalHeightMm)} mm`,
    `Paper     ${pagination.paper.toUpperCase()} ${pagination.orientation} - ${pagination.pages.length} sheets (${pagination.rows} x ${pagination.cols})`,
    '',
    'PRINT AT 100% - do NOT use "fit to page".',
    `Check the ${RULER_LENGTH_MM}mm ruler on each sheet with a real ruler.`,
    '',
    `Overlap ${PAGE_OVERLAP_MM}mm - align the cross marks and tape together.`,
    'A1 is top-left; A2 to the right, B1 below.',
    '',
    'Solid outline = cut line. Seam allowance is already included.',
    `Fine dashed inner line = stitch line (${SEAM_MM}mm seam allowance).`,
    'Grey dashed line = fold line.',
  ];
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
  const lines = guidePageLines(layout, pagination);

  let yMm = PAGE_MARGIN_MM + 12;
  for (const line of lines) {
    const point = toFramePoint(pagination, PAGE_MARGIN_MM + 6, yMm);
    page.drawText(line, {
      x: point.x,
      y: point.y,
      size: line === GUIDE_TITLE ? 16 : 10,
      font,
      color: CUT_COLOR,
    });
    yMm += line === '' ? 4 : 7;
  }

  // 전체 배치 축소도 — 페이지 격자와 전개도 외곽선
  const availableWidthMm = pagination.pageWidthMm - 2 * (PAGE_MARGIN_MM + 6);
  const scale = availableWidthMm / layout.totalWidthMm;
  const originYMm = yMm + 8;

  for (const tile of pagination.pages) {
    const rectXMm = PAGE_MARGIN_MM + 6 + tile.originXMm * scale;
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
      start: toFramePoint(pagination, PAGE_MARGIN_MM + 6 + a.xMm * scale, originYMm + a.yMm * scale),
      end: toFramePoint(pagination, PAGE_MARGIN_MM + 6 + b.xMm * scale, originYMm + b.yMm * scale),
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
  const font = await doc.embedFont(StandardFonts.Helvetica);

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
    drawRuler(ctx, font);
  }

  return doc.save();
}
