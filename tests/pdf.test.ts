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
  guideThumbnailRectMm,
  KOREAN_BOLD_FONT_CHARS,
  KOREAN_FONT_CHARS,
  PATTERN_NOTE,
  patternNotePointMm,
  SCALE_SQUARE_LABEL,
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

  it('안내 페이지를 한국어로 쓴다', () => {
    const text = guidePageLines(layout, paginate(layout, 'a4')).join('\n');
    expect(text).toContain('완성 치수');
    expect(text).toContain('도안 크기');
    expect(text).toContain('용지');
  });

  it('설명 문구를 남기지 않고 치수만 적는다', () => {
    const lines = guidePageLines(layout, paginate(layout, 'a4')).filter((l) => l !== '');
    expect(lines).toHaveLength(3);
  });

  it('칸 번호에 쓰이는 글자가 모두 서브셋 폰트 안에 있다', () => {
    // 칸 번호는 행마다 A, B, C... 로 올라간다. 큰 도안일수록 뒤 글자까지 쓴다.
    const labels = new Set<string>();
    for (const dims of [
      { widthMm: 100, heightMm: 50, depthMm: 40 },
      { widthMm: 400, heightMm: 300, depthMm: 200 },
    ]) {
      for (const paper of ['a4', 'a3'] as const) {
        for (const page of paginate(buildLayout(dims), paper).pages) {
          for (const ch of page.gridLabel) labels.add(ch);
        }
      }
    }
    expect([...labels].filter((ch) => !KOREAN_FONT_CHARS.has(ch))).toEqual([]);
  });

  it('PDF에 쓰는 모든 한국어가 서브셋 폰트 안에 있다', () => {
    const used = new Set(
      [...guidePageLines(layout, paginate(layout, 'a4')), SCALE_SQUARE_LABEL].join(''),
    );
    const missing = [...used].filter((ch) => !KOREAN_FONT_CHARS.has(ch));
    expect(missing).toEqual([]);
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

    expect(pageContent(doc, 0)).toContain(SCALE_SQUARE_STROKE);
    for (let i = 1; i < doc.getPageCount(); i++) {
      expect(pageContent(doc, i)).not.toContain(SCALE_SQUARE_STROKE);
    }
  });

  it('사각형 라벨이 한국어로 3cm를 알려준다', () => {
    expect(SCALE_SQUARE_LABEL).toContain('3cm');
    expect(SCALE_SQUARE_LABEL).toContain('확인');
  });

  it('사각형을 실제로 그린다', async () => {
    const pagination = paginate(layout, 'a4');
    const withSquare = await buildPdf(layout, pagination);
    // 빨간색이 쓰이면 콘텐츠에 색 지정이 늘어난다. 페이지 수는 그대로여야 한다.
    const doc = await PDFDocument.load(withSquare);
    expect(doc.getPageCount()).toBe(pagination.pages.length + 1);
  });
});

/**
 * 빨간 사각형은 테두리를 그리므로 스트로크 색(RG)을 지정한다.
 * 도안 하단 문구도 같은 빨강이지만 글자라서 채움 색(rg)을 쓴다.
 * 이 둘을 구분해야 "사각형이 도안 장에 없다"를 제대로 검사할 수 있다.
 */
const SCALE_SQUARE_STROKE = '0.85 0.1 0.1 RG';

/** 해당 페이지의 콘텐츠 스트림을 풀어 텍스트로 돌려준다. */
function pageContent(doc: PDFDocument, index: number): string {
  const contents = doc.getPage(index).node.Contents();
  const stream = contents instanceof PDFArray ? contents.lookup(0) : contents;
  if (!(stream instanceof PDFRawStream)) throw new Error('콘텐츠 스트림을 찾지 못했다');
  return inflateSync(Buffer.from(stream.asUint8Array())).toString('latin1');
}

describe('안내 페이지 축소도', () => {
  const cases: Dimensions[] = [
    { widthMm: 150, heightMm: 90, depthMm: 50 },
    { widthMm: 100, heightMm: 300, depthMm: 40 },   // 세로로 아주 긴 도안
    { widthMm: 400, heightMm: 50, depthMm: 200 },   // 가로로 아주 넓은 도안
    { widthMm: 270, heightMm: 140, depthMm: 100 },
  ];

  it('어떤 치수에서도 페이지 안에 들어간다', () => {
    for (const dims of cases) {
      for (const paper of ['a4', 'a3'] as const) {
        const l = buildLayout(dims);
        const pagination = paginate(l, paper);
        const rect = guideThumbnailRectMm(l, pagination);

        expect(rect.xMm).toBeGreaterThanOrEqual(PAGE_MARGIN_MM);
        expect(rect.yMm).toBeGreaterThanOrEqual(PAGE_MARGIN_MM);
        expect(rect.xMm + rect.widthMm).toBeLessThanOrEqual(pagination.pageWidthMm - PAGE_MARGIN_MM);
        expect(rect.yMm + rect.heightMm).toBeLessThanOrEqual(pagination.pageHeightMm - PAGE_MARGIN_MM);
      }
    }
  });

  it('전개도 가로세로 비율을 지킨다', () => {
    for (const dims of cases) {
      const l = buildLayout(dims);
      const rect = guideThumbnailRectMm(l, paginate(l, 'a4'));
      expect(rect.widthMm / rect.heightMm).toBeCloseTo(l.totalWidthMm / l.totalHeightMm, 6);
    }
  });

  it('빨간 사각형과 겹치지 않는다', () => {
    const l = buildLayout({ widthMm: 150, heightMm: 90, depthMm: 50 });
    const pagination = paginate(l, 'a4');
    const thumb = guideThumbnailRectMm(l, pagination);
    const square = scaleSquareRectMm(pagination);
    // 사각형은 오른쪽 위, 축소도는 그 아래에서 시작해야 한다.
    expect(thumb.yMm).toBeGreaterThanOrEqual(square.yMm + square.sizeMm);
  });
});

describe('도안 하단 강조 문구', () => {
  it('실제사이즈로 출력하라고 알려준다', () => {
    expect(PATTERN_NOTE).toContain('실제사이즈');
    expect(PATTERN_NOTE).toContain('출력');
  });

  it('문구의 모든 글자가 굵은 서브셋 폰트 안에 있다', () => {
    // 공백도 글리프다. 빠지면 그 자리가 넓게 벌어진다.
    const missing = [...PATTERN_NOTE].filter((ch) => !KOREAN_BOLD_FONT_CHARS.has(ch));
    expect(missing).toEqual([]);
  });

  it('모든 용지·방향에서 페이지 안에 들어간다', () => {
    for (const paper of ['a4', 'a3'] as const) {
      for (const dims of [
        { widthMm: 150, heightMm: 90, depthMm: 50 },
        { widthMm: 400, heightMm: 300, depthMm: 200 },
      ]) {
        const pagination = paginate(buildLayout(dims), paper);
        const point = patternNotePointMm(pagination);
        expect(point.xMm).toBeGreaterThan(0);
        expect(point.xMm).toBeLessThan(pagination.pageWidthMm);
        expect(point.yMm).toBeGreaterThan(0);
        expect(point.yMm).toBeLessThan(pagination.pageHeightMm);
      }
    }
  });

  it('도안이 그려지는 인쇄 영역 아래에 놓여 도면과 겹치지 않는다', () => {
    for (const paper of ['a4', 'a3'] as const) {
      const pagination = paginate(buildLayout({ widthMm: 150, heightMm: 90, depthMm: 50 }), paper);
      const point = patternNotePointMm(pagination);
      // 도안은 위쪽 여백부터 아래쪽 여백까지만 그려진다.
      expect(point.yMm).toBeGreaterThan(pagination.pageHeightMm - PAGE_MARGIN_MM);
    }
  });

  it('가로 가운데에 놓인다', () => {
    const pagination = paginate(buildLayout({ widthMm: 150, heightMm: 90, depthMm: 50 }), 'a4');
    expect(patternNotePointMm(pagination).xMm).toBeCloseTo(pagination.pageWidthMm / 2, 6);
  });
});

describe('빨간 문구와 사각형의 분업', () => {
  it('도안 장에는 하단 문구만 있고 사각형은 없다', async () => {
    const pagination = paginate(layout, 'a4');
    const doc = await PDFDocument.load(await buildPdf(layout, pagination));
    for (let i = 1; i < doc.getPageCount(); i++) {
      const content = pageContent(doc, i);
      expect(content).toContain('0.85 0.1 0.1 rg');   // 문구
      expect(content).not.toContain('0.85 0.1 0.1 RG'); // 사각형 테두리
    }
  });
});
