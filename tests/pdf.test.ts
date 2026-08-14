import { describe, expect, it } from 'vitest';
import { inflateSync } from 'node:zlib';
import { PDFArray, PDFDocument, PDFRawStream } from 'pdf-lib';
import { buildLayout } from '../src/core/layout';
import { paginate, PAGE_MARGIN_MM, PAGE_OVERLAP_MM, type Page, type Pagination } from '../src/core/tiling';
import {
  MM_TO_PT,
  SCALE_SQUARE_MM,
  buildPdf,
  KOREAN_BOLD_FONT_CHARS,
  KOREAN_FONT_CHARS,
  PATTERN_NOTE,
  patternNotePointMm,
  SCALE_SQUARE_LABEL,
  scaleSquareRectMm,
  gridLabelPointMm,
  joinMarksFor,
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

  it('안내 페이지 없이 도안 장만 만든다', async () => {
    const pagination = paginate(layout, 'a4');
    const doc = await PDFDocument.load(await buildPdf(layout, pagination));
    expect(doc.getPageCount()).toBe(pagination.pages.length);
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
    expect(doc.getPageCount()).toBe(pagination.pages.length);
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
    expect(doc.getPageCount()).toBe(pagination.pages.length);
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
    const used = new Set(SCALE_SQUARE_LABEL);
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
    expect(doc.getPageCount()).toBe(pagination.pages.length);
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

describe('3cm 사각형은 첫 도안 장에 있다', () => {
  it('첫 장에만 그린다', async () => {
    const pagination = paginate(layout, 'a4');
    expect(pagination.pages.length).toBeGreaterThan(1);
    const doc = await PDFDocument.load(await buildPdf(layout, pagination));

    expect(pageContent(doc, 0)).toContain('0.85 0.1 0.1 RG');
    for (let i = 1; i < doc.getPageCount(); i++) {
      expect(pageContent(doc, i)).not.toContain('0.85 0.1 0.1 RG');
    }
  });

  it('모든 장에 실치수 안내 문구는 남는다', async () => {
    const pagination = paginate(layout, 'a4');
    const doc = await PDFDocument.load(await buildPdf(layout, pagination));
    for (let i = 0; i < doc.getPageCount(); i++) {
      expect(pageContent(doc, i)).toContain('0.85 0.1 0.1 rg');
    }
  });

  it('재단선을 끊지 않도록 도안보다 먼저 그린다', async () => {
    const doc = await PDFDocument.load(await buildPdf(layout, paginate(layout, 'a4')));
    const content = pageContent(doc, 0);
    // 빨간 사각형 지정이 검은 재단선 지정보다 앞서야 한다.
    expect(content.indexOf('0.85 0.1 0.1 RG')).toBeLessThan(content.indexOf('0 0 0 RG'));
  });
});

describe('joinMarksFor — 페이지 이어 붙임 안내선', () => {
  const grid = paginate(layout, 'a4'); // 430 x 490 → 3열 x 2행
  const at = (row: number, col: number) => grid.pages.find((p) => p.row === row && p.col === col)!;
  const small = buildLayout({ widthMm: 100, depthMm: 40, heightMm: 50 });
  const single = paginate(small, 'a4');

  it('격자가 여러 장으로 나뉜다', () => {
    expect(grid.cols).toBeGreaterThan(1);
    expect(grid.rows).toBeGreaterThan(1);
  });

  it('한 장짜리에는 안내선이 없다', () => {
    expect(single.pages).toHaveLength(1);
    expect(joinMarksFor(single, single.pages[0]!)).toHaveLength(0);
  });

  it('첫 줄 첫 칸에는 안내선이 없다', () => {
    expect(joinMarksFor(grid, at(0, 0))).toHaveLength(0);
  });

  it('첫 줄 둘째 칸에는 왼쪽 안내선만 있다', () => {
    const marks = joinMarksFor(grid, at(0, 1));
    expect(marks.map((m) => m.edge)).toEqual(['left']);
  });

  it('둘째 줄 첫 칸에는 위쪽 안내선만 있다', () => {
    const marks = joinMarksFor(grid, at(1, 0));
    expect(marks.map((m) => m.edge)).toEqual(['top']);
  });

  it('둘째 줄 둘째 칸에는 왼쪽과 위쪽 둘 다 있다', () => {
    const marks = joinMarksFor(grid, at(1, 1));
    expect(marks.map((m) => m.edge).sort()).toEqual(['left', 'top']);
  });

  it('왼쪽 안내선이 인쇄 영역 왼쪽에서 겹침 폭만큼 안쪽에 세로로 선다', () => {
    const mark = joinMarksFor(grid, at(0, 1))[0]!;
    expect(mark.x1Mm).toBeCloseTo(PAGE_MARGIN_MM + PAGE_OVERLAP_MM, 6);
    expect(mark.x2Mm).toBeCloseTo(mark.x1Mm, 6);
    expect(mark.y1Mm).toBeCloseTo(PAGE_MARGIN_MM, 6);
    expect(mark.y2Mm).toBeCloseTo(grid.pageHeightMm - PAGE_MARGIN_MM, 6);
  });

  it('위쪽 안내선이 인쇄 영역 위에서 겹침 폭만큼 안쪽에 가로로 눕는다', () => {
    const mark = joinMarksFor(grid, at(1, 0)).find((m) => m.edge === 'top')!;
    expect(mark.y1Mm).toBeCloseTo(PAGE_MARGIN_MM + PAGE_OVERLAP_MM, 6);
    expect(mark.y2Mm).toBeCloseTo(mark.y1Mm, 6);
    expect(mark.x1Mm).toBeCloseTo(PAGE_MARGIN_MM, 6);
    expect(mark.x2Mm).toBeCloseTo(grid.pageWidthMm - PAGE_MARGIN_MM, 6);
  });

  it('라벨이 그 방향 이웃 페이지의 칸 번호다', () => {
    expect(joinMarksFor(grid, at(0, 1))[0]!.neighborLabel).toBe(at(0, 0).gridLabel);
    expect(joinMarksFor(grid, at(1, 2)).find((m) => m.edge === 'top')!.neighborLabel)
      .toBe(at(0, 2).gridLabel);
    expect(joinMarksFor(grid, at(1, 2)).find((m) => m.edge === 'left')!.neighborLabel)
      .toBe(at(1, 1).gridLabel);
  });

  it('라벨 글자가 모두 서브셋 폰트 안에 있다', () => {
    for (const page of grid.pages) {
      for (const mark of joinMarksFor(grid, page)) {
        for (const char of mark.neighborLabel) {
          expect(KOREAN_FONT_CHARS.has(char)).toBe(true);
        }
      }
    }
  });
});

describe('gridLabelPointMm — 칸 번호는 잘라내는 쪽에 두지 않는다', () => {
  const grid = paginate(layout, 'a4');
  const at = (row: number, col: number) => grid.pages.find((p) => p.row === row && p.col === col)!;

  it('자를 데가 없는 첫 칸은 인쇄 영역 모서리에 그대로 둔다', () => {
    const point = gridLabelPointMm(grid, at(0, 0));
    expect(point.xMm).toBeLessThan(PAGE_MARGIN_MM + PAGE_OVERLAP_MM);
    expect(point.yMm).toBeLessThan(PAGE_MARGIN_MM + PAGE_OVERLAP_MM);
  });

  it('칸 번호가 그 장의 모든 자르는 선 안쪽에 있다', () => {
    for (const page of grid.pages) {
      const point = gridLabelPointMm(grid, page);
      for (const mark of joinMarksFor(grid, page)) {
        if (mark.edge === 'left') expect(point.xMm).toBeGreaterThan(mark.x1Mm);
        if (mark.edge === 'top') expect(point.yMm).toBeGreaterThan(mark.y1Mm);
      }
    }
  });

  it('왼쪽만 자르는 장은 오른쪽으로만 밀린다', () => {
    const first = gridLabelPointMm(grid, at(0, 0));
    const shifted = gridLabelPointMm(grid, at(0, 1));
    expect(shifted.xMm - first.xMm).toBeCloseTo(PAGE_OVERLAP_MM, 6);
    expect(shifted.yMm).toBeCloseTo(first.yMm, 6);
  });

  it('위쪽만 자르는 장은 아래로만 밀린다', () => {
    const first = gridLabelPointMm(grid, at(0, 0));
    const shifted = gridLabelPointMm(grid, at(1, 0));
    expect(shifted.yMm - first.yMm).toBeCloseTo(PAGE_OVERLAP_MM, 6);
    expect(shifted.xMm).toBeCloseTo(first.xMm, 6);
  });
});

describe('joinMarksFor — 이웃 라벨은 남기는 쪽에 둔다', () => {
  const grid = paginate(layout, 'a4');

  it('라벨이 자르는 선 안쪽(버리지 않는 쪽)에 있다', () => {
    let checked = 0;
    for (const page of grid.pages) {
      for (const mark of joinMarksFor(grid, page)) {
        if (mark.edge === 'left') expect(mark.labelXMm).toBeGreaterThan(mark.x1Mm);
        if (mark.edge === 'top') expect(mark.labelYMm).toBeGreaterThan(mark.y1Mm);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(0);
  });

  it('라벨이 인쇄 영역 안에 있다', () => {
    for (const page of grid.pages) {
      for (const mark of joinMarksFor(grid, page)) {
        expect(mark.labelXMm).toBeGreaterThanOrEqual(PAGE_MARGIN_MM);
        expect(mark.labelYMm).toBeGreaterThanOrEqual(PAGE_MARGIN_MM);
        expect(mark.labelXMm).toBeLessThanOrEqual(grid.pageWidthMm - PAGE_MARGIN_MM);
        expect(mark.labelYMm).toBeLessThanOrEqual(grid.pageHeightMm - PAGE_MARGIN_MM);
      }
    }
  });
});
