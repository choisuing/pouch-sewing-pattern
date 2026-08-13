import { describe, expect, it } from 'vitest';
import { buildLayout } from '../src/core/layout';
import { PAGE_MARGIN_MM, PAGE_OVERLAP_MM, PAPER_MM, paginate } from '../src/core/tiling';
import type { Dimensions } from '../src/core/dimensions';

const travel: Dimensions = { widthMm: 270, depthMm: 100, heightMm: 140 };
const layout = buildLayout(travel);

describe('paginate', () => {
  it('전개도 전체를 덮는다', () => {
    for (const paper of ['a4', 'a3'] as const) {
      const p = paginate(layout, paper);
      const lastCol = Math.max(...p.pages.map((pg) => pg.originXMm + p.contentWidthMm));
      const lastRow = Math.max(...p.pages.map((pg) => pg.originYMm + p.contentHeightMm));
      expect(lastCol).toBeGreaterThanOrEqual(layout.totalWidthMm);
      expect(lastRow).toBeGreaterThanOrEqual(layout.totalHeightMm);
    }
  });

  it('첫 페이지는 원점에서 시작한다', () => {
    const p = paginate(layout, 'a4');
    expect(p.pages[0]).toMatchObject({ row: 0, col: 0, originXMm: 0, originYMm: 0 });
  });

  it('이웃 페이지가 겹침 폭만큼 겹친다', () => {
    const p = paginate(layout, 'a4');
    const step = p.contentWidthMm - PAGE_OVERLAP_MM;
    const secondInRow = p.pages.find((pg) => pg.row === 0 && pg.col === 1);
    expect(secondInRow).toBeDefined();
    expect(secondInRow?.originXMm).toBeCloseTo(step, 10);
  });

  it('인쇄 영역이 용지에서 여백을 뺀 크기다', () => {
    const p = paginate(layout, 'a4');
    expect(p.contentWidthMm).toBeCloseTo(p.pageWidthMm - 2 * PAGE_MARGIN_MM, 10);
    expect(p.contentHeightMm).toBeCloseTo(p.pageHeightMm - 2 * PAGE_MARGIN_MM, 10);
  });

  it('페이지 수가 행 x 열과 같고 격자 라벨이 붙는다', () => {
    const p = paginate(layout, 'a4');
    expect(p.pages).toHaveLength(p.rows * p.cols);
    expect(p.pages[0]?.gridLabel).toBe('A1');
    const second = p.pages.find((pg) => pg.row === 0 && pg.col === 1);
    expect(second).toBeDefined();
    expect(second?.gridLabel).toBe('A2');
    const nextRow = p.pages.find((pg) => pg.row === 1 && pg.col === 0);
    expect(nextRow).toBeDefined();
    expect(nextRow?.gridLabel).toBe('B1');
  });

  it('A3가 A4보다 장수가 적거나 같다', () => {
    expect(paginate(layout, 'a3').pages.length).toBeLessThanOrEqual(
      paginate(layout, 'a4').pages.length,
    );
  });

  it('장수가 적은 용지 방향을 고른다', () => {
    const p = paginate(layout, 'a4');
    const { widthMm, heightMm } = PAPER_MM.a4;
    const countFor = (pw: number, ph: number) => {
      const cw = pw - 2 * PAGE_MARGIN_MM;
      const ch = ph - 2 * PAGE_MARGIN_MM;
      const cols = Math.max(1, Math.ceil((layout.totalWidthMm - PAGE_OVERLAP_MM) / (cw - PAGE_OVERLAP_MM)));
      const rows = Math.max(1, Math.ceil((layout.totalHeightMm - PAGE_OVERLAP_MM) / (ch - PAGE_OVERLAP_MM)));
      return rows * cols;
    };
    const best = Math.min(countFor(widthMm, heightMm), countFor(heightMm, widthMm));
    expect(p.pages.length).toBe(best);
  });

  it('전개도가 한 장에 들어가면 1장만 만든다', () => {
    const tiny = buildLayout({ widthMm: 100, depthMm: 40, heightMm: 60 });
    const p = paginate(tiny, 'a3');
    expect(p.pages).toHaveLength(1);
    expect(p.rows).toBe(1);
    expect(p.cols).toBe(1);
  });
});
