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
  " !0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZcm세요인하확",
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
    xMm: pagination.pageWidthMm - PAGE_MARGIN_MM - 2 - SCALE_SQUARE_MM,
    yMm: PAGE_MARGIN_MM + 10,
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

export async function buildPdf(layout: Layout, pagination: Pagination): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const font = await doc.embedFont(decodeBase64(KOREAN_FONT_BASE64));
  const boldFont = await doc.embedFont(decodeBase64(KOREAN_BOLD_FONT_BASE64));

  for (const page of pagination.pages) {
    const pdfPage = doc.addPage([
      pagination.pageWidthMm * MM_TO_PT,
      pagination.pageHeightMm * MM_TO_PT,
    ]);
    const ctx: PageContext = { pdfPage, pagination, page };

    // 배율 확인용 사각형은 첫 장에만, 도안보다 먼저 그린다. 나중에 그리면
    // 흰 바탕이 재단선을 끊는데, 자를 대는 건 사각형의 빨간 변이라
    // 도안 선이 위로 지나가도 재는 데 지장이 없다.
    if (page === pagination.pages[0]) drawScaleSquare(pdfPage, pagination, font);

    drawPolygon(ctx, layout.outlineMm, 1);
    drawSeamLine(ctx, layout.seamLineMm);
    // 접힘선은 layout이 완성선 기준으로 계산해 둔다. 밴드 경계로 다시
    // 그리면 시접만큼 밀린 자리에 선이 생긴다.
    for (const line of layout.foldLinesMm) drawFoldLine(ctx, line);

    drawAlignmentMarks(ctx, font);
    drawPatternNote(ctx, boldFont);

  }

  return doc.save();
}
