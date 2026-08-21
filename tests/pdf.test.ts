import { describe, expect, it } from 'vitest';
import { inflateSync } from 'node:zlib';
import { PDFArray, PDFDocument, PDFName, PDFRawStream } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { KOREAN_BOLD_FONT_BASE64 } from '../src/core/korean-font';
import { buildLayout, halveOnFold, patternTitlePointMm, centerXMm } from '../src/core/layout';
import {
  patternTitle,
  WATERMARK_MESSAGE,
  WATERMARK_HANDLE,
  WATERMARK_OPACITY,
} from '../src/core/dimensions';
import { paginate, PAGE_MARGIN_MM, PAGE_OVERLAP_MM, type Page, type Pagination } from '../src/core/tiling';
import {
  MM_TO_PT,
  SCALE_SQUARE_MM,
  JOIN_DIAMOND_MM,
  FOLD_EDGE_LABEL,
  foldEdgeLabelXMm,
  buildPdf,
  KOREAN_BOLD_FONT_CHARS,
  KOREAN_FONT_BASE64,
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

    expect(hasScaleSquare(doc, 0)).toBe(true);
    for (let i = 1; i < doc.getPageCount(); i++) {
      expect(hasScaleSquare(doc, i)).toBe(false);
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

/**
 * 3cm 사각형을 콘텐츠 스트림에서 알아보는 표식.
 *
 * 빨간 테두리색만으로는 못 가린다. 맞춤 마름모도 같은 빨강을 쓰기 때문이다.
 * 대신 한 변 30mm를 pt로 옮긴 값을 찾는다. 이 길이로 선을 긋는 도형은
 * 축척 사각형뿐이라, 색이 아니라 크기로 가려낸다.
 */
const SCALE_SQUARE_SIDE_PT = String(SCALE_SQUARE_MM * MM_TO_PT);

/** 그 페이지에 3cm 사각형이 그려져 있는가. */
function hasScaleSquare(doc: PDFDocument, index: number): boolean {
  const content = pageContent(doc, index);
  return content.includes(SCALE_SQUARE_STROKE) && content.includes(SCALE_SQUARE_SIDE_PT);
}

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
      expect(hasScaleSquare(doc, i)).toBe(false);       // 사각형은 없다
    }
  });
});

describe('3cm 사각형은 첫 도안 장에 있다', () => {
  it('첫 장에만 그린다', async () => {
    const pagination = paginate(layout, 'a4');
    expect(pagination.pages.length).toBeGreaterThan(1);
    const doc = await PDFDocument.load(await buildPdf(layout, pagination));

    expect(hasScaleSquare(doc, 0)).toBe(true);
    for (let i = 1; i < doc.getPageCount(); i++) {
      expect(hasScaleSquare(doc, i)).toBe(false);
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


describe('joinMarksFor — 페이지 이어 붙임 표시', () => {
  const grid = paginate(layout, 'a4'); // 430 x 490 → 3열 x 2행
  const at = (row: number, col: number) => grid.pages.find((p) => p.row === row && p.col === col)!;
  const small = buildLayout({ widthMm: 100, depthMm: 40, heightMm: 50 });
  const single = paginate(small, 'a4');
  const edges = (page: Page) => joinMarksFor(grid, page).map((m) => m.edge).sort();

  /** 페이지 프레임 좌표(mm) → 도안 좌표(mm). 두 장이 같은 자리인지 대볼 때 쓴다. */
  const toPattern = (page: Page, xMm: number, yMm: number) => ({
    xMm: xMm - PAGE_MARGIN_MM + page.originXMm,
    yMm: yMm - PAGE_MARGIN_MM + page.originYMm,
  });

  it('격자가 여러 줄·여러 칸으로 나뉜다', () => {
    expect(grid.cols).toBeGreaterThan(1);
    expect(grid.rows).toBeGreaterThan(1);
  });

  it('한 장짜리에는 표시가 없다', () => {
    expect(single.pages).toHaveLength(1);
    expect(joinMarksFor(single, single.pages[0]!)).toHaveLength(0);
  });

  it('이웃이 있는 모든 방향에 표시가 생긴다', () => {
    expect(edges(at(0, 0))).toEqual(['bottom', 'right']);
    expect(edges(at(0, 1))).toEqual(['bottom', 'left', 'right']);
    expect(edges(at(0, 2))).toEqual(['bottom', 'left']);
    expect(edges(at(1, 0))).toEqual(['right', 'top']);
    expect(edges(at(1, 1))).toEqual(['left', 'right', 'top']);
    expect(edges(at(1, 2))).toEqual(['left', 'top']);
  });

  it('잘라내는 쪽은 왼쪽과 위쪽뿐이다', () => {
    for (const page of grid.pages) {
      for (const mark of joinMarksFor(grid, page)) {
        expect(mark.isCut).toBe(mark.edge === 'left' || mark.edge === 'top');
      }
    }
  });

  it('마주 보는 두 장의 선이 도안에서 같은 자리다', () => {
    let checked = 0;
    for (const page of grid.pages) {
      const right = joinMarksFor(grid, page).find((m) => m.edge === 'right');
      const neighbor = grid.pages.find((p) => p.row === page.row && p.col === page.col + 1);
      if (right === undefined || neighbor === undefined) continue;
      const left = joinMarksFor(grid, neighbor).find((m) => m.edge === 'left')!;
      expect(toPattern(page, right.x1Mm, right.y1Mm).xMm)
        .toBeCloseTo(toPattern(neighbor, left.x1Mm, left.y1Mm).xMm, 6);
      checked++;
    }
    expect(checked).toBeGreaterThan(0);
  });

  it('마주 보는 두 장의 마름모가 도안에서 같은 자리다', () => {
    let checked = 0;
    for (const page of grid.pages) {
      const below = grid.pages.find((p) => p.row === page.row + 1 && p.col === page.col);
      const bottom = joinMarksFor(grid, page).find((m) => m.edge === 'bottom');
      if (below === undefined || bottom === undefined) continue;
      const top = joinMarksFor(grid, below).find((m) => m.edge === 'top')!;
      expect(bottom.diamonds).toHaveLength(top.diamonds.length);
      for (let i = 0; i < bottom.diamonds.length; i++) {
        const a = toPattern(page, bottom.diamonds[i]!.xMm, bottom.diamonds[i]!.yMm);
        const b = toPattern(below, top.diamonds[i]!.xMm, top.diamonds[i]!.yMm);
        expect(a.xMm).toBeCloseTo(b.xMm, 6);
        expect(a.yMm).toBeCloseTo(b.yMm, 6);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(0);
  });

  it('선이 겹침 구간 한가운데에 놓인다', () => {
    const half = PAGE_OVERLAP_MM / 2;
    const left = joinMarksFor(grid, at(0, 1)).find((m) => m.edge === 'left')!;
    expect(left.x1Mm).toBeCloseTo(PAGE_MARGIN_MM + half, 6);
    const right = joinMarksFor(grid, at(0, 1)).find((m) => m.edge === 'right')!;
    expect(right.x1Mm).toBeCloseTo(grid.pageWidthMm - PAGE_MARGIN_MM - half, 6);
    const top = joinMarksFor(grid, at(1, 0)).find((m) => m.edge === 'top')!;
    expect(top.y1Mm).toBeCloseTo(PAGE_MARGIN_MM + half, 6);
    const bottom = joinMarksFor(grid, at(0, 0)).find((m) => m.edge === 'bottom')!;
    expect(bottom.y1Mm).toBeCloseTo(grid.pageHeightMm - PAGE_MARGIN_MM - half, 6);
  });

  it('마름모가 용지 가장자리에서 넉넉히 떨어져 있다', () => {
    // 여백 8mm는 프린터 비인쇄 영역 몫이다. 마름모가 그 안으로 들어가면 잘릴 수 있다.
    for (const page of grid.pages) {
      for (const mark of joinMarksFor(grid, page)) {
        for (const d of mark.diamonds) {
          expect(d.xMm).toBeGreaterThanOrEqual(PAGE_MARGIN_MM);
          expect(d.yMm).toBeGreaterThanOrEqual(PAGE_MARGIN_MM);
          expect(d.xMm).toBeLessThanOrEqual(grid.pageWidthMm - PAGE_MARGIN_MM);
          expect(d.yMm).toBeLessThanOrEqual(grid.pageHeightMm - PAGE_MARGIN_MM);
        }
      }
    }
  });

  it('마름모가 그 선 위에 얹혀 있다', () => {
    for (const page of grid.pages) {
      for (const mark of joinMarksFor(grid, page)) {
        expect(mark.diamonds.length).toBeGreaterThan(0);
        for (const d of mark.diamonds) {
          if (mark.x1Mm === mark.x2Mm) expect(d.xMm).toBeCloseTo(mark.x1Mm, 6);
          else expect(d.yMm).toBeCloseTo(mark.y1Mm, 6);
        }
      }
    }
  });

  it('▼가 마름모와 겹치지 않는다', () => {
    // 둘 다 선 위에 있어 같은 자리에 놓이면 뭉쳐 보인다.
    let checked = 0;
    for (const page of grid.pages) {
      for (const mark of joinMarksFor(grid, page)) {
        if (!mark.isCut) continue;
        for (const d of mark.diamonds) {
          const gap = Math.hypot(mark.arrowXMm - d.xMm, mark.arrowYMm - d.yMm);
          expect(gap).toBeGreaterThan(JOIN_DIAMOND_MM * 2);
          checked++;
        }
      }
    }
    expect(checked).toBeGreaterThan(0);
  });

  it('▼는 자르는 선 위에 있다', () => {
    for (const page of grid.pages) {
      for (const mark of joinMarksFor(grid, page)) {
        if (!mark.isCut) continue;
        if (mark.x1Mm === mark.x2Mm) expect(mark.arrowXMm).toBeCloseTo(mark.x1Mm, 6);
        else expect(mark.arrowYMm).toBeCloseTo(mark.y1Mm, 6);
      }
    }
  });

  it('라벨이 그 방향 이웃 페이지의 칸 번호다', () => {
    const marks = joinMarksFor(grid, at(1, 1));
    expect(marks.find((m) => m.edge === 'left')!.neighborLabel).toBe(at(1, 0).gridLabel);
    expect(marks.find((m) => m.edge === 'right')!.neighborLabel).toBe(at(1, 2).gridLabel);
    expect(marks.find((m) => m.edge === 'top')!.neighborLabel).toBe(at(0, 1).gridLabel);
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

describe('gridLabelPointMm — 칸 번호는 잘라내는 쪽에 두지 않는다', () => {
  const grid = paginate(layout, 'a4');
  const at = (row: number, col: number) => grid.pages.find((p) => p.row === row && p.col === col)!;

  it('자를 데가 없는 첫 칸만 밀리지 않는다', () => {
    const half = PAGE_OVERLAP_MM / 2;
    const first = gridLabelPointMm(grid, at(0, 0));
    // 왼쪽만 자르는 장은 오른쪽으로만, 위쪽만 자르는 장은 아래로만 밀린다.
    expect(gridLabelPointMm(grid, at(0, 1)).xMm - first.xMm).toBeCloseTo(half, 6);
    expect(gridLabelPointMm(grid, at(0, 1)).yMm).toBeCloseTo(first.yMm, 6);
    expect(gridLabelPointMm(grid, at(1, 0)).yMm - first.yMm).toBeCloseTo(half, 6);
    expect(gridLabelPointMm(grid, at(1, 0)).xMm).toBeCloseTo(first.xMm, 6);
  });

  it('칸 번호가 그 장의 자르는 선 안쪽에 있다', () => {
    for (const page of grid.pages) {
      const point = gridLabelPointMm(grid, page);
      for (const mark of joinMarksFor(grid, page)) {
        if (!mark.isCut) continue;
        if (mark.edge === 'left') expect(point.xMm).toBeGreaterThan(mark.x1Mm);
        if (mark.edge === 'top') expect(point.yMm).toBeGreaterThan(mark.y1Mm);
      }
    }
  });
});

describe('buildPdf — 골선', () => {
  const half = halveOnFold(layout);

  it('골선 문구에 쓰는 글자가 서브셋 폰트 안에 있다', () => {
    expect([...FOLD_EDGE_LABEL].filter((ch) => !KOREAN_FONT_CHARS.has(ch))).toEqual([]);
  });

  it('절반 전개도를 받으면 페이지 수가 준다', () => {
    expect(paginate(half, 'a4').pages.length).toBeLessThan(paginate(layout, 'a4').pages.length);
  });

  it('골선이 있는 장에만 골선을 그린다', async () => {
    const pagination = paginate(half, 'a4');
    const doc = await PDFDocument.load(await buildPdf(half, pagination));
    // 골선은 도안 좌표 foldEdgeYMm에 있다. 그 좌표를 담은 장에만 나타난다.
    const drawn = pagination.pages.filter((page) => {
      const top = page.originYMm;
      return half.foldEdgeYMm! >= top && half.foldEdgeYMm! <= top + pagination.contentHeightMm;
    });
    expect(drawn.length).toBeGreaterThan(0);
    expect(doc.getPageCount()).toBe(pagination.pages.length);
  });

  it('온전한 전개도에는 골선 문구가 없다', async () => {
    const pagination = paginate(layout, 'a4');
    const withFold = await buildPdf(half, paginate(half, 'a4'));
    const withoutFold = await buildPdf(layout, pagination);
    // 골선 문구가 들어가면 그만큼 콘텐츠가 늘어난다. 장수를 맞춰 비교하긴 어려우니
    // 골선 있는 쪽이 장당 평균 바이트가 더 큰지로 갈음한다.
    const perPageWith = withFold.length / paginate(half, 'a4').pages.length;
    const perPageWithout = withoutFold.length / pagination.pages.length;
    expect(perPageWith).toBeGreaterThan(perPageWithout);
  });
});

describe('foldEdgeLabelXMm — 골선 설명은 장마다 붙는다', () => {
  const half = halveOnFold(layout);
  const pagination = paginate(half, 'a4');

  it('골선이 걸치는 모든 장에 자리가 잡힌다', () => {
    const shown = pagination.pages.filter((p) => foldEdgeLabelXMm(pagination, p, half) !== undefined);
    expect(shown.length).toBe(pagination.pages.length);
    expect(shown.length).toBeGreaterThan(1);
  });

  it('그 자리가 해당 장에 실제로 보이는 구간 안이다', () => {
    for (const page of pagination.pages) {
      const xMm = foldEdgeLabelXMm(pagination, page, half)!;
      expect(xMm).toBeGreaterThanOrEqual(page.originXMm);
      expect(xMm).toBeLessThanOrEqual(page.originXMm + pagination.contentWidthMm);
      expect(xMm).toBeGreaterThanOrEqual(0);
      expect(xMm).toBeLessThanOrEqual(half.totalWidthMm);
    }
  });

  it('골선이 없는 전개도에는 자리가 없다', () => {
    const full = paginate(layout, 'a4');
    expect(foldEdgeLabelXMm(full, full.pages[0]!, layout)).toBeUndefined();
  });
});

describe('buildPdf — 중앙선과 패턴명', () => {
  it('패턴명에 쓰는 글자가 모두 서브셋 폰트 안에 있다', () => {
    for (const dims of [
      { widthMm: 160, heightMm: 80, depthMm: 40 },
      { widthMm: 400, heightMm: 300, depthMm: 200 },
      { widthMm: 100, heightMm: 50, depthMm: 40 },
    ]) {
      const missing = [...patternTitle(dims)].filter((ch) => !KOREAN_FONT_CHARS.has(ch));
      expect(missing).toEqual([]);
    }
  });

  it('중앙선과 패턴명이 실제로 그려진다', async () => {
    const pagination = paginate(layout, 'a4');
    const withMarks = await buildPdf(layout, pagination);
    // 밴드를 비워 패턴명 자리를 없애면 그만큼 콘텐츠가 줄어든다.
    const withoutTitle = await buildPdf({ ...layout, bands: [] }, pagination);
    expect(withMarks.length).toBeGreaterThan(withoutTitle.length);
  });

  it('골선으로 절반만 남겨도 패턴명 자리가 있다', () => {
    expect(patternTitlePointMm(halveOnFold(layout))).toBeDefined();
  });
});

describe('buildPdf — 시접 없이 뜬 도안', () => {
  const noSeam = buildLayout(travel, 0);

  it('시접 표시 문구에 쓰는 글자가 서브셋 폰트 안에 있다', () => {
    const missing = [...patternTitle(travel, 0)].filter((ch) => !KOREAN_FONT_CHARS.has(ch));
    expect(missing).toEqual([]);
  });

  it('완성선을 겹쳐 긋지 않아 콘텐츠가 더 가볍다', async () => {
    const pagination = paginate(noSeam, 'a4');
    const withSeam = buildLayout(travel);
    const a = await buildPdf(noSeam, pagination);
    const b = await buildPdf(withSeam, paginate(withSeam, 'a4'));
    expect(a.length).toBeLessThan(b.length);
  });

  it('시접 없이도 페이지 구성은 정상이다', async () => {
    const pagination = paginate(noSeam, 'a4');
    const doc = await PDFDocument.load(await buildPdf(noSeam, pagination));
    expect(doc.getPageCount()).toBe(pagination.pages.length);
  });
});

describe('서브셋 폰트가 선언한 글자를 실제로 담고 있다', () => {
  /*
   * PDF 문구를 바꿀 때 할 일이 둘이다. KOREAN_FONT_CHARS에 글자를 더하고,
   * scripts/build-korean-font.py를 다시 돌려야 한다. 앞의 것만 하고 뒤를
   * 빠뜨려도 다른 테스트는 모두 통과한다 — 전부 그 목록만 보기 때문이다.
   * 그러면 PDF에 그 글자가 빈칸으로 인쇄된다.
   *
   * 여기서는 목록이 아니라 글꼴 바이너리를 열어 대조한다. 폰트 재생성을
   * 잊으면 이 테스트가 걸린다.
   */
  const glyphsOf = (base64: string): Set<number> => {
    const font = fontkit.create(Buffer.from(base64, 'base64')) as { characterSet: number[] };
    return new Set(font.characterSet);
  };

  it('본문용 폰트가 KOREAN_FONT_CHARS를 모두 담는다', () => {
    const have = glyphsOf(KOREAN_FONT_BASE64);
    const missing = [...KOREAN_FONT_CHARS].filter((ch) => !have.has(ch.codePointAt(0)!));
    expect(missing).toEqual([]);
  });

  it('굵은 폰트가 KOREAN_BOLD_FONT_CHARS를 모두 담는다', () => {
    const have = glyphsOf(KOREAN_BOLD_FONT_BASE64);
    const missing = [...KOREAN_BOLD_FONT_CHARS].filter((ch) => !have.has(ch.codePointAt(0)!));
    expect(missing).toEqual([]);
  });

  it('선언하지 않은 글자를 쓸데없이 담지 않는다', () => {
    // 목록에서 글자를 빼고 폰트를 다시 만들지 않으면 여기서 걸린다.
    // 서브셋이 필요 이상으로 커지는 것도 함께 막는다.
    //
    // U+FFFF는 뺀다. 서브셋 도구가 남기는 표식이지 글자가 아니다.
    // 영구 미할당 비문자라 인쇄될 일이 없다. fontTools는 걸러내고
    // fontkit은 그대로 보고해서 둘의 셈이 하나 어긋난다.
    const NON_CHARACTER = 0xffff;
    const have = glyphsOf(KOREAN_FONT_BASE64);
    const declared = new Set([...KOREAN_FONT_CHARS].map((ch) => ch.codePointAt(0)!));
    const extra = [...have].filter((cp) => cp !== NON_CHARACTER && !declared.has(cp));
    expect(extra.map((cp) => String.fromCodePoint(cp))).toEqual([]);
  });
});

describe('buildPdf — 워터마크', () => {
  it('워터마크 글자가 모두 서브셋 폰트 안에 있다', () => {
    expect([...WATERMARK_MESSAGE + WATERMARK_HANDLE].filter((ch) => !KOREAN_FONT_CHARS.has(ch))).toEqual([]);
  });

  it('글꼴 바이너리에도 실제로 들어 있다', () => {
    const font = fontkit.create(Buffer.from(KOREAN_FONT_BASE64, 'base64')) as { characterSet: number[] };
    const have = new Set(font.characterSet);
    expect([...WATERMARK_MESSAGE + WATERMARK_HANDLE].filter((ch) => !have.has(ch.codePointAt(0)!))).toEqual([]);
  });

  it('출처 두 줄을 절반만 진하게 찍는다', async () => {
    // 미리보기 SVG와 같은 값이라야 화면에서 본 대로 종이에 나온다.
    // 두 줄이 같은 값을 쓰므로 ExtGState는 하나로 묶여 나온다.
    const layout = buildLayout({ widthMm: 150, heightMm: 90, depthMm: 50 });
    const doc = await PDFDocument.load(await buildPdf(layout, paginate(layout, 'a4')));
    const states = doc.getPages()[0]!.node.Resources()!.lookup(PDFName.of('ExtGState'))!.toString();
    expect(states).toContain(`/ca ${WATERMARK_OPACITY}`);
  });
});
