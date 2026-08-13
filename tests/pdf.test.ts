import { describe, expect, it } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { buildLayout } from '../src/core/layout';
import { paginate } from '../src/core/tiling';
import { MM_TO_PT, buildPdf } from '../src/core/pdf';
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
