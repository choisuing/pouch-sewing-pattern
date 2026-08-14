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

export interface JoinMark {
  /** 이 선이 붙어 있는 인쇄 영역 가장자리. */
  readonly edge: 'left' | 'top';
  readonly x1Mm: number;
  readonly y1Mm: number;
  readonly x2Mm: number;
  readonly y2Mm: number;
  /** 이 선 너머로 이어지는 이웃 페이지의 칸 번호. */
  readonly neighborLabel: string;
  /** 칸 번호를 찍을 자리. 잘라 버리는 쪽에 두면 붙이는 동안 읽을 수 없다. */
  readonly labelXMm: number;
  readonly labelYMm: number;
}

/** ▼ 마크의 팔 길이 (mm). */
const JOIN_ARM_MM = 4;

/**
 * 이어 붙일 때 잘라낼 자리 (페이지 프레임 좌표, mm).
 *
 * 이웃 페이지끼리는 PAGE_OVERLAP_MM만큼 겹쳐 있다. 장마다 왼쪽과 위쪽
 * 겹침만 잘라내면 나머지 변은 손대지 않고도 딱 맞물린다. 예를 들어 A4
 * 3열에서 A1은 도안 0~194를, A2는 184~378을 담는데, A2의 왼쪽 10mm를
 * 잘라내면 194~378이 되어 A1의 끝과 정확히 만난다. 그래서 오른쪽·아래에는
 * 선을 긋지 않는다 — 자를 일이 없다.
 */
export function joinMarksFor(pagination: Pagination, page: Page): JoinMark[] {
  const labelAt = (row: number, col: number) =>
    pagination.pages.find((p) => p.row === row && p.col === col)?.gridLabel;

  const marks: JoinMark[] = [];

  if (page.col > 0) {
    const neighborLabel = labelAt(page.row, page.col - 1);
    if (neighborLabel !== undefined) {
      const xMm = PAGE_MARGIN_MM + PAGE_OVERLAP_MM;
      marks.push({
        edge: 'left',
        x1Mm: xMm,
        y1Mm: PAGE_MARGIN_MM,
        x2Mm: xMm,
        y2Mm: pagination.pageHeightMm - PAGE_MARGIN_MM,
        neighborLabel,
        labelXMm: xMm + 2,
        labelYMm: pagination.pageHeightMm / 2 - JOIN_ARM_MM - 2,
      });
    }
  }

  if (page.row > 0) {
    const neighborLabel = labelAt(page.row - 1, page.col);
    if (neighborLabel !== undefined) {
      const yMm = PAGE_MARGIN_MM + PAGE_OVERLAP_MM;
      marks.push({
        edge: 'top',
        x1Mm: PAGE_MARGIN_MM,
        y1Mm: yMm,
        x2Mm: pagination.pageWidthMm - PAGE_MARGIN_MM,
        y2Mm: yMm,
        neighborLabel,
        labelXMm: pagination.pageWidthMm / 2 + JOIN_ARM_MM + 2,
        labelYMm: yMm + 5,
      });
    }
  }

  return marks;
}

/**
 * 칸 번호를 찍을 자리 (페이지 프레임 좌표, mm).
 *
 * 잘라내는 쪽에 두면 이어 붙이는 순간 번호가 사라진다. 자르는 선이 있는
 * 방향으로 겹침 폭만큼 들여 놓는다. 자를 데가 없는 첫 칸은 그대로 둔다.
 */
export function gridLabelPointMm(pagination: Pagination, page: Page): { xMm: number; yMm: number } {
  const marks = joinMarksFor(pagination, page);
  const trimLeftMm = marks.some((m) => m.edge === 'left') ? PAGE_OVERLAP_MM : 0;
  const trimTopMm = marks.some((m) => m.edge === 'top') ? PAGE_OVERLAP_MM : 0;
  return {
    xMm: PAGE_MARGIN_MM + trimLeftMm + 2,
    yMm: PAGE_MARGIN_MM + trimTopMm + 6,
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

  const labelMm = gridLabelPointMm(pagination, page);
  const labelPoint = toFramePoint(pagination, labelMm.xMm, labelMm.yMm);
  ctx.pdfPage.drawText(page.gridLabel, {
    x: labelPoint.x,
    y: labelPoint.y,
    size: 12,
    font,
    color: MARK_COLOR,
  });
}

/**
 * 이어 붙임 안내선. 잘라낼 자리를 긴 점선으로 긋고, 버릴 쪽을 향한 ▼와
 * 그 너머로 이어지는 이웃 칸 번호를 붙인다.
 *
 * 색은 맞춤표·칸 번호와 같은 MARK_COLOR를 쓴다. 도안 선(재단선 검정 실선,
 * 완성선 2,2 점선, 접힘선 연회색 4,4 점선)이 아니라 조립 표시라는 걸
 * 색과 점선 간격으로 함께 가른다.
 *
 * ▼는 글자가 아니라 선으로 그린다. 서브셋 폰트에 없는 글자를 쓰면 그
 * 자리가 비어 나오기 때문이다. 글자는 이웃 칸 번호(A~Z, 0~9)뿐이다.
 */
function drawJoinMarks(ctx: PageContext, font: PDFFont) {
  const { pagination, page } = ctx;
  const armMm = JOIN_ARM_MM;

  for (const mark of joinMarksFor(pagination, page)) {
    ctx.pdfPage.drawLine({
      start: toFramePoint(pagination, mark.x1Mm, mark.y1Mm),
      end: toFramePoint(pagination, mark.x2Mm, mark.y2Mm),
      thickness: 0.5,
      color: MARK_COLOR,
      dashArray: [6, 3],
    });

    // ▼의 꼭짓점은 잘라 버리는 쪽에 둔다. 가장자리 바깥을 가리키는 셈이다.
    const midXMm = (mark.x1Mm + mark.x2Mm) / 2;
    const midYMm = (mark.y1Mm + mark.y2Mm) / 2;
    const isLeft = mark.edge === 'left';
    const apex = isLeft
      ? { xMm: mark.x1Mm - armMm, yMm: midYMm }
      : { xMm: midXMm, yMm: mark.y1Mm - armMm };
    const wings = isLeft
      ? [{ xMm: mark.x1Mm, yMm: midYMm - armMm }, { xMm: mark.x1Mm, yMm: midYMm + armMm }]
      : [{ xMm: midXMm - armMm, yMm: mark.y1Mm }, { xMm: midXMm + armMm, yMm: mark.y1Mm }];

    for (const wing of wings) {
      ctx.pdfPage.drawLine({
        start: toFramePoint(pagination, apex.xMm, apex.yMm),
        end: toFramePoint(pagination, wing.xMm, wing.yMm),
        thickness: 0.5,
        color: MARK_COLOR,
      });
    }

    const labelPoint = toFramePoint(pagination, mark.labelXMm, mark.labelYMm);
    ctx.pdfPage.drawText(mark.neighborLabel, {
      x: labelPoint.x,
      y: labelPoint.y,
      size: 9,
      font,
      color: MARK_COLOR,
    });
  }
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
    drawJoinMarks(ctx, font);
    drawPatternNote(ctx, boldFont);

  }

  return doc.save();
}
