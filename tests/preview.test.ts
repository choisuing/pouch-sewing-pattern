import { describe, expect, it } from 'vitest';
import { buildLayout } from '../src/core/layout';
import { paginate } from '../src/core/tiling';
import { renderPreviewSvg, escapeXml } from '../src/ui/preview';

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
