// PDF 안내 문구는 영문만 쓴다. pdf-lib 표준 폰트에 한글 글리프가 없어
// drawText가 "WinAnsi cannot encode" 오류를 던지고, 한글 폰트를 번들하면
// 외부 의존 0 원칙과 산출물 크기에 어긋난다. 한국어 안내는 화면(UI)에서 제공한다.
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import type { Layout, Line, Point } from './layout';
import { PAGE_MARGIN_MM, PAGE_OVERLAP_MM, type Pagination, type Page } from './tiling';

export const MM_TO_PT = 72 / 25.4;

/** 축척 검증용 눈금자 길이 (mm) */
export const RULER_LENGTH_MM = 50;

const CUT_COLOR = rgb(0, 0, 0);
const FOLD_COLOR = rgb(0.55, 0.55, 0.55);
const MARK_COLOR = rgb(0.2, 0.2, 0.2);

interface PageContext {
  readonly pdfPage: PDFPage;
  readonly pagination: Pagination;
  readonly page: Page;
}

/** 전개도 좌표(mm) → PDF 좌표(pt). 페이지 원점과 y축 뒤집기를 함께 처리한다. */
function toPagePoint(ctx: PageContext, xMm: number, yMm: number): { x: number; y: number } {
  const localXMm = xMm - ctx.page.originXMm + PAGE_MARGIN_MM;
  const localYMm = yMm - ctx.page.originYMm + PAGE_MARGIN_MM;
  return {
    x: localXMm * MM_TO_PT,
    y: (ctx.pagination.pageHeightMm - localYMm) * MM_TO_PT,
  };
}

function drawPolygon(ctx: PageContext, points: readonly Point[], thickness: number) {
  for (let i = 0; i < points.length; i++) {
    const a = points[i]!;
    const b = points[(i + 1) % points.length]!;
    ctx.pdfPage.drawLine({
      start: toPagePoint(ctx, a.xMm, a.yMm),
      end: toPagePoint(ctx, b.xMm, b.yMm),
      thickness,
      color: CUT_COLOR,
    });
  }
}

function drawFoldLine(ctx: PageContext, line: Line) {
  ctx.pdfPage.drawLine({
    start: toPagePoint(ctx, line.x1Mm, line.y1Mm),
    end: toPagePoint(ctx, line.x2Mm, line.y2Mm),
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
    const x = corner.xMm * MM_TO_PT;
    const y = (pagination.pageHeightMm - corner.yMm) * MM_TO_PT;
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

  ctx.pdfPage.drawText(page.gridLabel, {
    x: (PAGE_MARGIN_MM + 2) * MM_TO_PT,
    y: (pagination.pageHeightMm - PAGE_MARGIN_MM - 6) * MM_TO_PT,
    size: 12,
    font,
    color: MARK_COLOR,
  });
}

function drawRuler(ctx: PageContext, font: PDFFont) {
  const { pagination } = ctx;
  const startXMm = PAGE_MARGIN_MM + 4;
  const yMm = pagination.pageHeightMm - PAGE_MARGIN_MM - 4;
  const y = (pagination.pageHeightMm - yMm) * MM_TO_PT;

  ctx.pdfPage.drawLine({
    start: { x: startXMm * MM_TO_PT, y },
    end: { x: (startXMm + RULER_LENGTH_MM) * MM_TO_PT, y },
    thickness: 1,
    color: MARK_COLOR,
  });
  for (const tickXMm of [startXMm, startXMm + RULER_LENGTH_MM]) {
    ctx.pdfPage.drawLine({
      start: { x: tickXMm * MM_TO_PT, y },
      end: { x: tickXMm * MM_TO_PT, y: y + 3 * MM_TO_PT },
      thickness: 1,
      color: MARK_COLOR,
    });
  }
  ctx.pdfPage.drawText(`${RULER_LENGTH_MM}mm`, {
    x: (startXMm + RULER_LENGTH_MM + 3) * MM_TO_PT,
    y: y - 1,
    size: 8,
    font,
    color: MARK_COLOR,
  });
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
  const { widthMm: W, depthMm: D, heightMm: H } = layout.dimensions;

  const title = 'BOX POUCH PATTERN';
  const lines = [
    title,
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
    'Seam allowance is already included - cut as drawn.',
  ];

  let yMm = PAGE_MARGIN_MM + 12;
  for (const line of lines) {
    page.drawText(line, {
      x: (PAGE_MARGIN_MM + 6) * MM_TO_PT,
      y: (pagination.pageHeightMm - yMm) * MM_TO_PT,
      size: line === title ? 16 : 10,
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
    const x = (PAGE_MARGIN_MM + 6 + tile.originXMm * scale) * MM_TO_PT;
    const wMm = Math.min(pagination.contentWidthMm, layout.totalWidthMm - tile.originXMm) * scale;
    const hMm = Math.min(pagination.contentHeightMm, layout.totalHeightMm - tile.originYMm) * scale;
    const yTopMm = originYMm + tile.originYMm * scale;
    page.drawRectangle({
      x,
      y: (pagination.pageHeightMm - yTopMm - hMm) * MM_TO_PT,
      width: wMm * MM_TO_PT,
      height: hMm * MM_TO_PT,
      borderColor: FOLD_COLOR,
      borderWidth: 0.5,
    });
    page.drawText(tile.gridLabel, {
      x: x + 3,
      y: (pagination.pageHeightMm - yTopMm - 5) * MM_TO_PT,
      size: 7,
      font,
      color: MARK_COLOR,
    });
  }

  for (let i = 0; i < layout.outlineMm.length; i++) {
    const a = layout.outlineMm[i]!;
    const b = layout.outlineMm[(i + 1) % layout.outlineMm.length]!;
    page.drawLine({
      start: {
        x: (PAGE_MARGIN_MM + 6 + a.xMm * scale) * MM_TO_PT,
        y: (pagination.pageHeightMm - originYMm - a.yMm * scale) * MM_TO_PT,
      },
      end: {
        x: (PAGE_MARGIN_MM + 6 + b.xMm * scale) * MM_TO_PT,
        y: (pagination.pageHeightMm - originYMm - b.yMm * scale) * MM_TO_PT,
      },
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
