import { describe, expect, it } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { buildLayout } from '../src/core/layout';
import { paginate, PAGE_MARGIN_MM, type Page, type Pagination } from '../src/core/tiling';
import { MM_TO_PT, buildPdf, toFramePoint, toPagePoint } from '../src/core/pdf';
import type { Dimensions } from '../src/core/dimensions';

const travel: Dimensions = { widthMm: 270, depthMm: 100, heightMm: 140 };
const layout = buildLayout(travel);

describe('buildPdf', () => {
  it('PDF 헤더로 시작하는 바이트를 만든다', async () => {
    const bytes = await buildPdf(layout, paginate(layout, 'a4'));
    const head = new TextDecoder().decode(bytes.slice(0, 5));
    expect(head).toBe('%PDF-');
  });

  it('페이지 수가 타일링 결과 + 안내 1장과 일치한다', async () => {
    const pagination = paginate(layout, 'a4');
    const bytes = await buildPdf(layout, pagination);
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBe(pagination.pages.length + 1);
  });

  it('페이지 크기가 지정한 용지와 일치한다', async () => {
    const pagination = paginate(layout, 'a4');
    const bytes = await buildPdf(layout, pagination);
    const doc = await PDFDocument.load(bytes);
    for (const page of doc.getPages()) {
      expect(page.getWidth()).toBeCloseTo(pagination.pageWidthMm * MM_TO_PT, 1);
      expect(page.getHeight()).toBeCloseTo(pagination.pageHeightMm * MM_TO_PT, 1);
    }
  });

  it('A3도 같은 규칙으로 만들어진다', async () => {
    const pagination = paginate(layout, 'a3');
    const bytes = await buildPdf(layout, pagination);
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBe(pagination.pages.length + 1);
    expect(doc.getPage(0).getWidth()).toBeCloseTo(pagination.pageWidthMm * MM_TO_PT, 1);
  });
});

describe('toFramePoint / toPagePoint 좌표 변환', () => {
  const a4Portrait: Pagination = {
    paper: 'a4',
    orientation: 'portrait',
    pageWidthMm: 210,
    pageHeightMm: 297,
    contentWidthMm: 210 - 2 * PAGE_MARGIN_MM,
    contentHeightMm: 297 - 2 * PAGE_MARGIN_MM,
    rows: 1,
    cols: 1,
    pages: [],
  };
  const firstTile: Page = { row: 0, col: 0, gridLabel: 'A1', originXMm: 0, originYMm: 0 };

  it('toFramePoint는 x를 그대로 mm→pt 변환하고 y만 페이지 높이 기준으로 뒤집는다', () => {
    const p = toFramePoint(a4Portrait, 10, 20);
    expect(p.x).toBeCloseTo(10 * MM_TO_PT, 9);
    expect(p.y).toBeCloseTo((297 - 20) * MM_TO_PT, 9);
  });

  it('A4 세로 페이지에서 전개도 원점 (0,0)이 여백만큼 이동한 뒤 y가 뒤집힌다', () => {
    const p = toPagePoint(a4Portrait, firstTile, 0, 0);
    expect(p.x).toBeCloseTo(PAGE_MARGIN_MM * MM_TO_PT, 9);
    expect(p.y).toBeCloseTo((297 - PAGE_MARGIN_MM) * MM_TO_PT, 9);
  });
});
