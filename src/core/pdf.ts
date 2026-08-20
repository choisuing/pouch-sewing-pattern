// SPDX-License-Identifier: MIT
// Copyright (C) 2026 choisuing

// PDF 문구는 한국어로 쓴다. pdf-lib 표준 폰트에는 한글 글리프가 없으므로
// 필요한 글자만 담은 Noto Sans KR 서브셋(core/korean-font.ts)을 심어서 쓴다.
// 서브셋에 없는 글자는 그리지 못하니, 문구를 바꿀 때는 서브셋도 다시 만들어야 한다.
import fontkit from '@pdf-lib/fontkit';
import { PDFDocument, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import { KOREAN_BOLD_FONT_BASE64, KOREAN_FONT_BASE64 } from './korean-font';
export { KOREAN_FONT_BASE64 };
import { centerXMm, patternTitlePointMm, type Layout, type Line, type Point } from './layout';
import { patternTitle, WATERMARK_HANDLE, WATERMARK_MESSAGE } from './dimensions';
import { PAGE_MARGIN_MM, PAGE_OVERLAP_MM, type Pagination, type Page } from './tiling';

export const MM_TO_PT = 72 / 25.4;

/**
 * 서브셋 폰트가 담고 있는 글자. PDF에 찍는 문구는 전부 이 안에 있어야 한다.
 * 없는 글자를 쓰면 그 자리가 비어 나오므로, 테스트로 미리 막는다.
 */
export const KOREAN_FONT_CHARS: ReadonlySet<string> = new Set(
  " !*@_0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcilmnsu각게골들만보사선세시쁘없어예요우음인접지치퍼파하확",
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

/** 골선 변에 붙이는 문구. 서브셋 폰트에 골·선이 들어 있어야 한다. */
export const FOLD_EDGE_LABEL = '골선';

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

export type JoinEdge = 'left' | 'top' | 'right' | 'bottom';

export interface JoinMark {
  /** 이 선이 붙어 있는 인쇄 영역 가장자리. */
  readonly edge: JoinEdge;
  readonly x1Mm: number;
  readonly y1Mm: number;
  readonly x2Mm: number;
  readonly y2Mm: number;
  /** 이 선을 실제로 잘라내는가. 왼쪽·위쪽만 자르고 나머지는 맞추는 기준선이다. */
  readonly isCut: boolean;
  /** 맞춤용 마름모의 중심. 마주 보는 장의 같은 순번과 도안에서 같은 자리다. */
  readonly diamonds: readonly { readonly xMm: number; readonly yMm: number }[];
  /** ▼가 선에 닿는 지점. isCut일 때만 그린다. */
  readonly arrowXMm: number;
  readonly arrowYMm: number;
  /** 이 선 너머로 이어지는 이웃 페이지의 칸 번호. */
  readonly neighborLabel: string;
  /** 칸 번호를 찍을 자리. 잘라 버리는 쪽에 두면 붙이는 동안 읽을 수 없다. */
  readonly labelXMm: number;
  readonly labelYMm: number;
}

/** ▼ 마크의 팔 길이 (mm). */
const JOIN_ARM_MM = 4;

/** 맞춤 마름모의 중심에서 꼭짓점까지 (mm). */
export const JOIN_DIAMOND_MM = 3;

/** 마름모를 놓을 자리. 선 길이를 4등분한 안쪽 세 지점. */
const DIAMOND_STOPS = [0.25, 0.5, 0.75];

/** ▼를 놓을 자리. 마름모 세 곳(0.25/0.5/0.75) 사이의 빈 구간이라 뭉치지 않는다. */
const ARROW_STOP = 0.625;

/** 칸 번호 두 글자가 차지하는 폭 어림값 (mm). 선 왼쪽에 놓을 때 물려 주는 몫이다. */
const JOIN_LABEL_WIDTH_MM = 9;

/**
 * 이어 붙일 자리 (페이지 프레임 좌표, mm).
 *
 * 이웃 페이지끼리는 PAGE_OVERLAP_MM만큼 겹쳐 있다. 그 겹침 구간의
 * 한가운데를 기준선으로 삼는다. 왼쪽·위쪽은 거기서 잘라내고, 오른쪽·아래는
 * 이웃의 자른 변이 와서 앉을 자리를 알려 준다.
 *
 * 한가운데를 쓰는 이유가 있다. 겹침의 경계에서 자르면 두 장이 선 하나만
 * 공유해 맞춤 표시를 양쪽에 남길 자리가 없다. 한가운데에서 자르면 겹침의
 * 절반이 두 장에 모두 남아, 같은 도안 좌표에 찍은 마름모가 포갤 때 겹친다.
 * A4 3열이면 A1은 도안 0~194를, A2는 189~378을 담아 189~194가 겹친다.
 *
 * 마름모를 선 위에 얹되 용지 가장자리에서는 떨어뜨린다. 여백 8mm는 프린터
 * 비인쇄 영역 몫이라 거기까지 뻗으면 잘려 나갈 수 있다.
 */
export function joinMarksFor(pagination: Pagination, page: Page): JoinMark[] {
  const labelAt = (row: number, col: number) =>
    pagination.pages.find((p) => p.row === row && p.col === col)?.gridLabel;

  const halfMm = PAGE_OVERLAP_MM / 2;
  const leftMm = PAGE_MARGIN_MM;
  const topMm = PAGE_MARGIN_MM;
  const rightMm = pagination.pageWidthMm - PAGE_MARGIN_MM;
  const bottomMm = pagination.pageHeightMm - PAGE_MARGIN_MM;

  const vertical = (xMm: number, edge: JoinEdge, neighborLabel: string): JoinMark => ({
    edge,
    x1Mm: xMm,
    y1Mm: topMm,
    x2Mm: xMm,
    y2Mm: bottomMm,
    isCut: edge === 'left',
    diamonds: DIAMOND_STOPS.map((t) => ({ xMm, yMm: topMm + (bottomMm - topMm) * t })),
    arrowXMm: xMm,
    arrowYMm: topMm + (bottomMm - topMm) * ARROW_STOP,
    neighborLabel,
    // 라벨은 남기는 쪽에 둔다. 자르는 왼쪽 선은 오른쪽이, 오른쪽 선은 왼쪽이 남는다.
    // 글자가 왼쪽 기준으로 그려지므로 왼쪽에 놓을 때는 글자 폭만큼 더 물린다.
    labelXMm: edge === 'left' ? xMm + JOIN_DIAMOND_MM + 1 : xMm - JOIN_DIAMOND_MM - JOIN_LABEL_WIDTH_MM,
    labelYMm: topMm + (bottomMm - topMm) * 0.25 - JOIN_DIAMOND_MM - 2,
  });

  const horizontal = (yMm: number, edge: JoinEdge, neighborLabel: string): JoinMark => ({
    edge,
    x1Mm: leftMm,
    y1Mm: yMm,
    x2Mm: rightMm,
    y2Mm: yMm,
    isCut: edge === 'top',
    diamonds: DIAMOND_STOPS.map((t) => ({ xMm: leftMm + (rightMm - leftMm) * t, yMm })),
    arrowXMm: leftMm + (rightMm - leftMm) * ARROW_STOP,
    arrowYMm: yMm,
    neighborLabel,
    labelXMm: leftMm + (rightMm - leftMm) * 0.25 + JOIN_DIAMOND_MM + 1,
    // 자르는 위쪽 선은 아래가, 아래쪽 선은 위가 남는다.
    labelYMm: edge === 'top' ? yMm + JOIN_DIAMOND_MM + 4 : yMm - JOIN_DIAMOND_MM - 2,
  });

  const marks: JoinMark[] = [];
  const left = labelAt(page.row, page.col - 1);
  const right = labelAt(page.row, page.col + 1);
  const above = labelAt(page.row - 1, page.col);
  const below = labelAt(page.row + 1, page.col);

  if (left !== undefined) marks.push(vertical(leftMm + halfMm, 'left', left));
  if (right !== undefined) marks.push(vertical(rightMm - halfMm, 'right', right));
  if (above !== undefined) marks.push(horizontal(topMm + halfMm, 'top', above));
  if (below !== undefined) marks.push(horizontal(bottomMm - halfMm, 'bottom', below));

  return marks;
}

/**
 * 칸 번호를 찍을 자리 (페이지 프레임 좌표, mm).
 *
 * 잘라내는 쪽에 두면 이어 붙이는 순간 번호가 사라진다. 자르는 선이 있는
 * 방향으로 겹침의 절반만큼 들여 놓는다. 자를 데가 없는 첫 칸은 그대로 둔다.
 */
export function gridLabelPointMm(pagination: Pagination, page: Page): { xMm: number; yMm: number } {
  const cuts = joinMarksFor(pagination, page).filter((m) => m.isCut);
  const halfMm = PAGE_OVERLAP_MM / 2;
  const trimLeftMm = cuts.some((m) => m.edge === 'left') ? halfMm : 0;
  const trimTopMm = cuts.some((m) => m.edge === 'top') ? halfMm : 0;
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
/** 맞춤 마름모. 도안 선과 섞이지 않도록 빨강을 쓴다. */
const JOIN_DIAMOND_COLOR = rgb(0.85, 0.1, 0.1);
/** 골선. 재단선으로 오인하면 안 되는 선이라 빨강으로 굵게 긋는다. */
const FOLD_EDGE_COLOR = rgb(0.7, 0.1, 0.1);
/** 출처 문구. 도면을 읽는 데 방해되지 않도록 옅게. */
const WATERMARK_COLOR = rgb(0.6, 0.6, 0.6);
/** 세로 중앙선. 제도에서 중심선에 쓰는 일점쇄선으로 긋는다. */
const CENTER_COLOR = rgb(0.5, 0.48, 0.44);

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

/**
 * 골선 기호와 글자를 놓을 자리 (도안 좌표 x, mm). 골선이 없으면 undefined.
 *
 * 전개도 한가운데 한 번만 찍으면 그 자리를 담은 장에만 설명이 실린다. 나머지
 * 장에는 빨간 선만 남아 무슨 선인지 알 수 없다. 그래서 장마다, 그 장에 실제로
 * 보이는 구간의 한가운데에 하나씩 찍는다.
 */
export function foldEdgeLabelXMm(
  pagination: Pagination,
  page: Page,
  layout: Layout,
): number | undefined {
  if (layout.foldEdgeYMm === undefined) return undefined;
  const fromMm = Math.max(0, page.originXMm);
  const toMm = Math.min(layout.totalWidthMm, page.originXMm + pagination.contentWidthMm);
  if (toMm <= fromMm) return undefined;
  return (fromMm + toMm) / 2;
}

/**
 * 골선. 절반만 남긴 전개도의 아래 변이다. 자르는 선이 아니라 원단 접은
 * 자리에 얹는 선이라, 재단선보다 굵고 빨갛게 긋고 글자로 짚어 준다.
 * 접는 자리를 잘라 버리면 도안이 반쪽이 되므로 헷갈릴 여지를 남기지 않는다.
 *
 * 반원 두 개를 덧그려 재봉 도안에서 쓰는 골선 기호를 흉내 낸다.
 */
function drawFoldEdge(ctx: PageContext, layout: Layout, font: PDFFont) {
  const yMm = layout.foldEdgeYMm;
  if (yMm === undefined) return;

  const { pagination, page } = ctx;
  ctx.pdfPage.drawLine({
    start: toPagePoint(pagination, page, 0, yMm),
    end: toPagePoint(pagination, page, layout.totalWidthMm, yMm),
    thickness: 1.6,
    color: FOLD_EDGE_COLOR,
  });

  const centerXMm = foldEdgeLabelXMm(pagination, page, layout);
  if (centerXMm === undefined) return;

  for (const radiusMm of [4, 6]) {
    const steps = 24;
    for (let i = 0; i < steps; i++) {
      const a = Math.PI + (Math.PI * i) / steps;
      const b = Math.PI + (Math.PI * (i + 1)) / steps;
      ctx.pdfPage.drawLine({
        start: toPagePoint(pagination, page, centerXMm + radiusMm * Math.cos(a), yMm + radiusMm * Math.sin(a)),
        end: toPagePoint(pagination, page, centerXMm + radiusMm * Math.cos(b), yMm + radiusMm * Math.sin(b)),
        thickness: 0.8,
        color: FOLD_EDGE_COLOR,
      });
    }
  }

  const label = toPagePoint(pagination, page, centerXMm + 9, yMm - 2);
  ctx.pdfPage.drawText(FOLD_EDGE_LABEL, {
    x: label.x,
    y: label.y,
    size: 10,
    font,
    color: FOLD_EDGE_COLOR,
  });
}

/**
 * 세로 중앙선과 도안 이름.
 *
 * 중앙선은 앞판·바닥의 가로 한가운데다. 원단에 올릴 때 기준이 된다. 선 종류가
 * 이미 여럿이라 제도에서 중심선에 쓰는 일점쇄선으로 긋는다. 모양만으로 갈리므로
 * 색은 눈에 띄지 않는 회색이면 된다.
 *
 * 이름은 앞판 한가운데에 한 번만 찍는다. 전개도에서 가장 넓게 비어 있고,
 * 골선으로 절반만 남겨도 살아 있는 자리다.
 */
function drawCenterAndTitle(ctx: PageContext, layout: Layout, font: PDFFont) {
  const { pagination, page } = ctx;
  const xMm = centerXMm(layout);

  ctx.pdfPage.drawLine({
    start: toPagePoint(pagination, page, xMm, 0),
    end: toPagePoint(pagination, page, xMm, layout.totalHeightMm),
    thickness: 0.4,
    color: CENTER_COLOR,
    dashArray: [8, 3, 1.5, 3],
  });

  const point = patternTitlePointMm(layout);
  if (point === undefined) return;

  const text = patternTitle(layout.dimensions, layout.seamMm);
  const size = 11;
  const anchor = toPagePoint(pagination, page, point.xMm, point.yMm);
  ctx.pdfPage.drawText(text, {
    x: anchor.x - font.widthOfTextAtSize(text, size) / 2,
    y: anchor.y,
    size,
    font,
    color: MARK_COLOR,
  });

  // 권유 한 줄은 작고 옅게. 도면을 읽는 데 방해가 되면 안 된다.
  const messageSize = 8;
  const messageAnchor = toPagePoint(pagination, page, point.xMm, point.yMm + 6);
  ctx.pdfPage.drawText(WATERMARK_MESSAGE, {
    x: messageAnchor.x - font.widthOfTextAtSize(WATERMARK_MESSAGE, messageSize) / 2,
    y: messageAnchor.y,
    size: messageSize,
    font,
    color: WATERMARK_COLOR,
  });

  // 계정은 이름보다도 크게. 여기가 강조하고 싶은 자리다.
  const handleSize = 15;
  const handleAnchor = toPagePoint(pagination, page, point.xMm, point.yMm + 14);
  ctx.pdfPage.drawText(WATERMARK_HANDLE, {
    x: handleAnchor.x - font.widthOfTextAtSize(WATERMARK_HANDLE, handleSize) / 2,
    y: handleAnchor.y,
    size: handleSize,
    font,
    color: MARK_COLOR,
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

    // 맞춤 마름모. 마주 보는 장의 같은 자리에도 찍히므로 포개면 겹친다.
    for (const d of mark.diamonds) {
      const corners = [
        { xMm: d.xMm, yMm: d.yMm - JOIN_DIAMOND_MM },
        { xMm: d.xMm + JOIN_DIAMOND_MM, yMm: d.yMm },
        { xMm: d.xMm, yMm: d.yMm + JOIN_DIAMOND_MM },
        { xMm: d.xMm - JOIN_DIAMOND_MM, yMm: d.yMm },
      ];
      for (let i = 0; i < corners.length; i++) {
        const a = corners[i]!;
        const b = corners[(i + 1) % corners.length]!;
        ctx.pdfPage.drawLine({
          start: toFramePoint(pagination, a.xMm, a.yMm),
          end: toFramePoint(pagination, b.xMm, b.yMm),
          thickness: 0.6,
          color: JOIN_DIAMOND_COLOR,
        });
      }
    }

    // ▼는 실제로 잘라내는 선에만. 꼭짓점이 버리는 쪽을 가리킨다.
    if (mark.isCut) {
      const isLeft = mark.edge === 'left';
      const apex = isLeft
        ? { xMm: mark.arrowXMm - armMm, yMm: mark.arrowYMm }
        : { xMm: mark.arrowXMm, yMm: mark.arrowYMm - armMm };
      const wings = isLeft
        ? [{ xMm: mark.arrowXMm, yMm: mark.arrowYMm - armMm }, { xMm: mark.arrowXMm, yMm: mark.arrowYMm + armMm }]
        : [{ xMm: mark.arrowXMm - armMm, yMm: mark.arrowYMm }, { xMm: mark.arrowXMm + armMm, yMm: mark.arrowYMm }];

      for (const wing of wings) {
        ctx.pdfPage.drawLine({
          start: toFramePoint(pagination, apex.xMm, apex.yMm),
          end: toFramePoint(pagination, wing.xMm, wing.yMm),
          thickness: 0.5,
          color: MARK_COLOR,
        });
      }
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
    // 시접이 0이면 완성선이 재단선과 같은 자리다. 겹쳐 그으면 선만 두꺼워진다.
    if (layout.seamMm > 0) drawSeamLine(ctx, layout.seamLineMm);
    // 접힘선은 layout이 완성선 기준으로 계산해 둔다. 밴드 경계로 다시
    // 그리면 시접만큼 밀린 자리에 선이 생긴다.
    for (const line of layout.foldLinesMm) drawFoldLine(ctx, line);

    drawCenterAndTitle(ctx, layout, font);
    drawFoldEdge(ctx, layout, font);
    drawAlignmentMarks(ctx, font);
    drawJoinMarks(ctx, font);
    drawPatternNote(ctx, boldFont);

  }

  return doc.save();
}
