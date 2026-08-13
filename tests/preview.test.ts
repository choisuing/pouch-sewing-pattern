import { describe, expect, it } from 'vitest';
import { buildLayout } from '../src/core/layout';
import { paginate } from '../src/core/tiling';
import { renderPreviewSvg, escapeXml, describePagination } from '../src/ui/preview';

const layout = buildLayout({ widthMm: 270, depthMm: 100, heightMm: 140 });
const pagination = paginate(layout, 'a4');
const svg = renderPreviewSvg(layout, pagination);

describe('renderPreviewSvg', () => {
  it('전개도 크기에 맞는 viewBox를 쓴다', () => {
    expect(svg).toContain('viewBox="0 0 430 490"');
  });

  it('외곽선을 폴리곤으로 그린다', () => {
    expect(svg).toContain('<polygon');
  });

  it('밴드 이름을 모두 표시한다', () => {
    for (const label of ['지퍼단', '앞판', '바닥', '뒤판']) {
      expect(svg).toContain(label);
    }
  });

  it('전체 치수를 표시한다', () => {
    expect(svg).toContain('430');
    expect(svg).toContain('490');
  });

  it('페이지 분할 경계를 페이지 수만큼 그린다', () => {
    const count = (svg.match(/class="page-tile"/g) ?? []).length;
    expect(count).toBe(pagination.pages.length);
  });

  it('접힘선을 점선으로 그린다', () => {
    expect(svg).toContain('stroke-dasharray');
  });
});

describe('renderPreviewSvg — 시접 표시', () => {
  it('완성선을 그린다', () => {
    expect(svg).toContain('class="seam-line"');
  });

  it('완성선이 재단선 안쪽 10mm 좌표를 쓴다', () => {
    // 좌상단 재단선 (0,0)에 대응하는 완성선 꼭짓점은 (10,10).
    const match = svg.match(/class="seam-line"[^>]*points="([^"]*)"/);
    expect(match?.[1]).toBeDefined();
    expect(match![1]!.split(' ')[0]).toBe('10,10');
  });

  it('재단선과 완성선 사이를 시접 영역으로 채운다', () => {
    expect(svg).toContain('class="seam-band"');
    expect(svg).toMatch(/class="seam-band"[^>]*fill-rule="evenodd"/);
  });

  it('시접 영역이 재단선과 완성선 두 개의 닫힌 경로로 이루어진다', () => {
    const match = svg.match(/class="seam-band"[^>]*d="([^"]*)"/);
    expect(match?.[1]).toBeDefined();
    expect((match![1]!.match(/M/g) ?? []).length).toBe(2);
    expect((match![1]!.match(/Z/g) ?? []).length).toBe(2);
  });
});

describe('renderPreviewSvg — 페이지 번호', () => {
  it('타일마다 격자 번호를 붙인다', () => {
    const count = (svg.match(/class="tile-label"/g) ?? []).length;
    expect(count).toBe(pagination.pages.length);
  });

  it('PDF와 같은 격자 라벨을 쓴다', () => {
    for (const page of pagination.pages) {
      expect(svg).toContain(`>${page.gridLabel}</text>`);
    }
  });
});

describe('describePagination', () => {
  it('용지·방향·총 장수·격자를 한 줄로 알려준다', () => {
    expect(describePagination(pagination)).toBe(
      `A4 세로 · 총 ${pagination.pages.length}장 (${pagination.cols}열 × ${pagination.rows}행)`,
    );
  });

  it('가로 방향을 가로로 적는다', () => {
    const tall = buildLayout({ widthMm: 100, depthMm: 40, heightMm: 100 });
    const landscape = paginate(tall, 'a4');
    expect(landscape.orientation).toBe('landscape');
    expect(describePagination(landscape)).toContain('A4 가로');
  });

  it('A3도 용지 이름을 대문자로 적는다', () => {
    expect(describePagination(paginate(layout, 'a3'))).toContain('A3');
  });

  it('한 장이면 격자를 1열 × 1행으로 적는다', () => {
    const tiny = paginate(buildLayout({ widthMm: 100, depthMm: 40, heightMm: 60 }), 'a3');
    expect(describePagination(tiny)).toBe('A3 세로 · 총 1장 (1열 × 1행)');
  });
});

describe('escapeXml', () => {
  it('<를 &lt;로 변환한다', () => {
    expect(escapeXml('<')).toBe('&lt;');
  });

  it('>를 &gt;로 변환한다', () => {
    expect(escapeXml('>')).toBe('&gt;');
  });

  it('&를 &amp;로 변환한다', () => {
    expect(escapeXml('&')).toBe('&amp;');
  });

  it('"를 &quot;로 변환한다', () => {
    expect(escapeXml('"')).toBe('&quot;');
  });

  it('여러 특수문자를 동시에 변환한다', () => {
    expect(escapeXml('A & B <test> "quoted"')).toBe(
      'A &amp; B &lt;test&gt; &quot;quoted&quot;',
    );
  });
});
