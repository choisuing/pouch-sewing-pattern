import { describe, expect, it } from 'vitest';
import { inflateSync } from 'node:zlib';
import { PDFArray, PDFDocument, PDFRawStream } from 'pdf-lib';
import { buildLayout } from '../src/core/layout';
import { paginate, PAGE_MARGIN_MM, type Page, type Pagination } from '../src/core/tiling';
import {
  MM_TO_PT,
  SCALE_SQUARE_MM,
  buildPdf,
  guidePageLines,
  scaleSquareRectMm,
  toFramePoint,
  toPagePoint,
} from '../src/core/pdf';
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

describe('buildPdf — 완성선', () => {
  it('완성선을 실제로 그린다', async () => {
    const pagination = paginate(layout, 'a4');
    const withSeam = await buildPdf(layout, pagination);
    const withoutSeam = await buildPdf({ ...layout, seamLineMm: [] }, pagination);
    expect(withSeam.length).toBeGreaterThan(withoutSeam.length);
  });

  it('완성선이 없어도 페이지 구성은 그대로다', async () => {
    const pagination = paginate(layout, 'a4');
    const doc = await PDFDocument.load(await buildPdf({ ...layout, seamLineMm: [] }, pagination));
    expect(doc.getPageCount()).toBe(pagination.pages.length + 1);
  });

  it('안내 페이지 문구에 완성선 설명을 넣는다', () => {
    const lines = guidePageLines(layout, paginate(layout, 'a4'));
    expect(lines.join('\n')).toContain('stitch line');
  });

  it('안내 문구를 표준 폰트가 인코딩할 수 있는 문자로만 쓴다', () => {
    // pdf-lib 표준 폰트는 WinAnsi 밖의 글자를 인코딩하지 못한다.
    for (const line of guidePageLines(layout, paginate(layout, 'a4'))) {
      expect(line).toMatch(/^[\x20-\x7e]*$/);
    }
  });
});

describe('축척 확인용 3cm 정사각형', () => {
  it('한 변이 정확히 30mm다', () => {
    expect(SCALE_SQUARE_MM).toBe(30);
    const rect = scaleSquareRectMm(paginate(layout, 'a4'));
    expect(rect.sizeMm).toBe(30);
  });

  it('모든 용지·방향에서 인쇄 영역 안에 들어간다', () => {
    for (const paper of ['a4', 'a3'] as const) {
      for (const dims of [
        { widthMm: 270, depthMm: 100, heightMm: 140 },
        { widthMm: 100, depthMm: 40, heightMm: 100 },
        { widthMm: 400, depthMm: 200, heightMm: 300 },
      ]) {
        const pagination = paginate(buildLayout(dims), paper);
        const rect = scaleSquareRectMm(pagination);

        expect(rect.xMm).toBeGreaterThanOrEqual(PAGE_MARGIN_MM);
        expect(rect.yMm).toBeGreaterThanOrEqual(PAGE_MARGIN_MM);
        expect(rect.xMm + rect.sizeMm).toBeLessThanOrEqual(
          pagination.pageWidthMm - PAGE_MARGIN_MM,
        );
        expect(rect.yMm + rect.sizeMm).toBeLessThanOrEqual(
          pagination.pageHeightMm - PAGE_MARGIN_MM,
        );
      }
    }
  });

  it('안내 문구와 겹치지 않도록 오른쪽 위에 놓인다', () => {
    const pagination = paginate(layout, 'a4');
    const rect = scaleSquareRectMm(pagination);
    expect(rect.xMm).toBeGreaterThan(pagination.pageWidthMm / 2);
    expect(rect.yMm).toBeLessThan(pagination.pageHeightMm / 2);
  });

  it('안내 페이지에만 그리고 도안 장은 건드리지 않는다', async () => {
    const pagination = paginate(layout, 'a4');
    expect(pagination.pages.length).toBeGreaterThan(1);
    const doc = await PDFDocument.load(await buildPdf(layout, pagination));

    expect(pageContent(doc, 0)).toContain(SCALE_COLOR_OPS);
    for (let i = 1; i < doc.getPageCount(); i++) {
      expect(pageContent(doc, i)).not.toContain(SCALE_COLOR_OPS);
    }
  });

  it('안내 페이지가 3cm 사각형을 설명한다', () => {
    const text = guidePageLines(layout, paginate(layout, 'a4')).join('\n');
    expect(text).toContain('3cm');
    expect(text).not.toContain('50mm ruler');
    // 도안 장이 아니라 이 페이지에서 재라고 알려줘야 한다.
    expect(text).not.toContain('each sheet');
  });

  it('사각형을 실제로 그린다', async () => {
    const pagination = paginate(layout, 'a4');
    const withSquare = await buildPdf(layout, pagination);
    // 빨간색이 쓰이면 콘텐츠에 색 지정이 늘어난다. 페이지 수는 그대로여야 한다.
    const doc = await PDFDocument.load(withSquare);
    expect(doc.getPageCount()).toBe(pagination.pages.length + 1);
  });
});

/** 빨간 축척 사각형이 쓰는 색 지정 연산자. */
const SCALE_COLOR_OPS = '0.85 0.1 0.1';

/** 해당 페이지의 콘텐츠 스트림을 풀어 텍스트로 돌려준다. */
function pageContent(doc: PDFDocument, index: number): string {
  const contents = doc.getPage(index).node.Contents();
  const stream = contents instanceof PDFArray ? contents.lookup(0) : contents;
  if (!(stream instanceof PDFRawStream)) throw new Error('콘텐츠 스트림을 찾지 못했다');
  return inflateSync(Buffer.from(stream.asUint8Array())).toString('latin1');
}
