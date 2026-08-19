import { describe, expect, it } from 'vitest';
import { buildLayout, halveOnFold } from '../src/core/layout';
import { patternTitle } from '../src/core/dimensions';
import { paginate } from '../src/core/tiling';
import { renderPreviewSvg, escapeXml, describePagination, legendItems } from '../src/ui/preview';

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

  it('접힘선을 그리지 않는다', () => {
    expect(svg).not.toContain('class="fold-line"');
  });

  it('완성선을 재단선보다 얇은 실선으로 그린다', () => {
    const seam = svg.match(/class="seam-line"[^>]*stroke-width="([\d.]+)"/);
    const cut = svg.match(/<polygon points="[^"]*"[^>]*stroke-width="([\d.]+)"/);
    expect(Number(seam![1])).toBeLessThan(Number(cut![1]));
    // 실선이므로 점선 지정이 없어야 한다.
    expect(svg).not.toMatch(/class="seam-line"[^>]*stroke-dasharray/);
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

describe('renderPreviewSvg — 선 두께와 글자 크기', () => {
  it('재단선이 도안 폭에 비례해 가늘어진다', () => {
    const small = renderPreviewSvg(buildLayout({ widthMm: 100, heightMm: 50, depthMm: 40 }), paginate(buildLayout({ widthMm: 100, heightMm: 50, depthMm: 40 }), 'a4'));
    const large = buildLayout({ widthMm: 400, heightMm: 300, depthMm: 200 });
    const largeSvg = renderPreviewSvg(large, paginate(large, 'a4'));
    const cut = (svg: string) => Number(svg.match(/<polygon points="[^"]*"[^>]*stroke-width="([\d.]+)"/)![1]);
    const viewW = (svg: string) => Number(svg.match(/viewBox="0 0 ([\d.]+)/)![1]);
    expect(cut(largeSvg) / viewW(largeSvg)).toBeCloseTo(cut(small) / viewW(small), 3);
  });

  it('밴드 이름 글자도 도안 폭에 비례한다', () => {
    const a = buildLayout({ widthMm: 100, heightMm: 50, depthMm: 40 });
    const b = buildLayout({ widthMm: 400, heightMm: 300, depthMm: 200 });
    const svgA = renderPreviewSvg(a, paginate(a, 'a4'));
    const svgB = renderPreviewSvg(b, paginate(b, 'a4'));
    const size = (svg: string) => Number(svg.match(/class="band-label"[^>]*font-size="([\d.]+)"/)![1]);
    const viewW = (svg: string) => Number(svg.match(/viewBox="0 0 ([\d.]+)/)![1]);
    expect(size(svgB) / viewW(svgB)).toBeCloseTo(size(svgA) / viewW(svgA), 3);
  });
});

describe('renderPreviewSvg — 페이지 경계선이 도안 위에 보인다', () => {
  it('도안 채움보다 나중에 그린다', () => {
    // 도안 채움(#fffdf5)은 불투명하다. 타일을 먼저 그리면 가운데가 덮여
    // 경계선이 도안 밖 끝부분만 보인다.
    const tile = svg.indexOf('class="page-tile"');
    const fill = svg.indexOf('<polygon points=');
    expect(tile).toBeGreaterThan(fill);
  });

  it('두 페이지가 만나는 자리에 세로 경계선이 있다', () => {
    const wide = buildLayout({ widthMm: 200, heightMm: 50, depthMm: 50 });
    const p = paginate(wide, 'a4');
    expect(p.cols).toBe(2);
    const svgWide = renderPreviewSvg(wide, p);
    const xs = [...svgWide.matchAll(/class="page-tile" x="([\d.]+)"[^>]*width="([\d.]+)"/g)]
      .map((m) => Number(m[1]) + Number(m[2]));
    // 첫 페이지의 오른쪽 끝이 도안 한가운데 어딘가에 있어야 한다.
    expect(xs[0]).toBeGreaterThan(0);
    expect(xs[0]).toBeLessThan(wide.totalWidthMm);
  });
});

describe('renderPreviewSvg — WebKit 크기 계산', () => {
  /*
   * 지금은 치수 라벨 때문에 넣은 overflow: visible이 WebKit의 0폭 계산을
   * 우연히 막아 주고 있다. 그 스타일을 빼면 그림이 사라지므로 폭을 직접
   * 못 박아 우연에 기대지 않게 한다.
   */
  it('폭을 명시해 WebKit이 0으로 계산하지 않게 한다', () => {
    const style = svg.match(/<svg[^>]*style="([^"]*)"/)![1]!;
    expect(style).toMatch(/(^|;)\s*width:\s*100%/);
  });
});

describe('renderPreviewSvg — 골선', () => {
  const half = halveOnFold(buildLayout({ widthMm: 270, depthMm: 100, heightMm: 140 }));
  const halfSvg = renderPreviewSvg(half, paginate(half, 'a4'));

  it('절반 전개도에는 골선을 긋는다', () => {
    expect(halfSvg).toContain('class="fold-edge"');
  });

  it('온전한 전개도에는 골선이 없다', () => {
    expect(svg).not.toContain('class="fold-edge"');
  });

  it('골선이 아래 변을 가로지른다', () => {
    const line = halfSvg.match(/class="fold-edge"[^>]*x1="([\d.-]+)" y1="([\d.-]+)" x2="([\d.-]+)" y2="([\d.-]+)"/)!;
    const [x1, y1, x2, y2] = line.slice(1).map(Number);
    expect(y1).toBeCloseTo(half.foldEdgeYMm!, 1);
    expect(y2).toBeCloseTo(half.foldEdgeYMm!, 1);
    expect(x1).toBeCloseTo(0, 1);
    expect(x2).toBeCloseTo(half.totalWidthMm, 1);
  });

  it('글자 대신 골선 기호(반원 두 겹)를 얹는다', () => {
    // 도안을 써 본 사람이면 아는 기호라 글자로 풀어 쓰지 않는다.
    const arcs = [...halfSvg.matchAll(/class="fold-edge-mark"/g)];
    expect(arcs).toHaveLength(2);
    expect(halfSvg).not.toContain('원단 접은 자리');
  });

  it('기호가 골선 위에 얹힌다', () => {
    const paths = [...halfSvg.matchAll(/class="fold-edge-mark" d="M ([\d.-]+),([\d.-]+) A ([\d.-]+),/g)];
    expect(paths.length).toBeGreaterThan(0);
    for (const m of paths) {
      expect(Number(m[2])).toBeCloseTo(half.foldEdgeYMm!, 1);
      // 반원 두 겹이 서로 다른 반지름이라야 겹쳐 보인다.
      expect(Number(m[3])).toBeGreaterThan(0);
    }
    const radii = paths.map((m) => Number(m[3]));
    expect(new Set(radii).size).toBe(radii.length);
  });
});

describe('renderPreviewSvg — 중앙선과 패턴명', () => {
  const line = (s: string) => s.match(/class="center-line"[^>]*x1="([\d.-]+)" y1="([\d.-]+)" x2="([\d.-]+)" y2="([\d.-]+)"/);

  it('세로 중앙선이 폭의 한가운데를 관통한다', () => {
    const m = line(svg)!;
    const [x1, y1, x2, y2] = m.slice(1).map(Number);
    expect(x1).toBeCloseTo(layout.totalWidthMm / 2, 1);
    expect(x2).toBeCloseTo(x1!, 6);
    expect(y1).toBeCloseTo(0, 6);
    expect(y2).toBeCloseTo(layout.totalHeightMm, 1);
  });

  it('중앙선은 일점쇄선이라 다른 선과 갈린다', () => {
    const dash = svg.match(/class="center-line"[^>]*stroke-dasharray="([^"]*)"/)![1]!;
    expect(dash.trim().split(/\s+/).length).toBe(4);
  });

  it('패턴명과 치수를 앞판 안에 찍는다', () => {
    expect(svg).toContain(patternTitle(layout.dimensions));
  });

  it('패턴명이 앞판 라벨과 겹치지 않는다', () => {
    const titleY = Number(svg.match(/class="pattern-title"[^>]*y="([\d.-]+)"/)![1]);
    const front = layout.bands.find((b) => b.id === 'front')!;
    const bandY = front.yMm + front.heightMm / 2;
    expect(Math.abs(titleY - bandY)).toBeGreaterThan(1);
    expect(titleY).toBeGreaterThan(front.yMm);
    expect(titleY).toBeLessThan(front.yMm + front.heightMm);
  });
});

describe('renderPreviewSvg — 시접 없이 뜬 도안', () => {
  const dims = { widthMm: 270, depthMm: 100, heightMm: 140 };
  const noSeam = buildLayout(dims, 0);
  const noSeamSvg = renderPreviewSvg(noSeam, paginate(noSeam, 'a4'));

  it('완성선을 겹쳐 긋지 않는다', () => {
    // 재단선과 같은 자리라 두 번 그으면 인쇄물에서 선만 두꺼워진다.
    expect(noSeamSvg).not.toContain('class="seam-line"');
    expect(svg).toContain('class="seam-line"');
  });

  it('시접 띠도 칠하지 않는다', () => {
    expect(noSeamSvg).not.toContain('class="seam-band"');
    expect(svg).toContain('class="seam-band"');
  });

  it('재단선과 나머지 표시는 그대로 있다', () => {
    expect(noSeamSvg).toContain('class="center-line"');
    expect(noSeamSvg).toContain('class="pattern-title"');
    expect(noSeamSvg).toMatch(/<polygon points=/);
  });

  it('도안 이름에 시접없음이 붙는다', () => {
    expect(noSeamSvg).toContain('시접없음');
    expect(svg).not.toContain('시접없음');
  });
});

describe('legendItems — 범례는 실제로 그린 선만 알려준다', () => {
  it('시접이 있으면 다섯 줄이다', () => {
    const items = legendItems(buildLayout({ widthMm: 270, depthMm: 100, heightMm: 140 }));
    expect(items.map((i) => i.text)).toEqual([
      '재단선 — 이 선대로 자릅니다',
      '완성선 — 여기를 박습니다',
      '시접 10mm — 이미 포함되어 있습니다',
      '중앙선 — 도안 폭의 한가운데',
      '인쇄 페이지 경계 — 칸 번호는 PDF와 같습니다',
    ]);
  });

  it('시접이 없으면 완성선과 시접 줄이 빠진다', () => {
    // 그리지도 않은 선을 범례에 두면 도면에서 찾다가 헤맨다.
    const items = legendItems(buildLayout({ widthMm: 270, depthMm: 100, heightMm: 140 }, 0));
    const texts = items.map((i) => i.text);
    expect(texts).not.toContain('완성선 — 여기를 박습니다');
    expect(texts.some((t) => t.startsWith('시접'))).toBe(false);
    expect(texts).toContain('재단선 — 이 선대로 자릅니다');
  });

  it('골선으로 뽑으면 골선 줄이 붙는다', () => {
    const half = halveOnFold(buildLayout({ widthMm: 270, depthMm: 100, heightMm: 140 }));
    expect(legendItems(half).some((i) => i.text.startsWith('골선'))).toBe(true);
    expect(legendItems(buildLayout({ widthMm: 270, depthMm: 100, heightMm: 140 })).some((i) => i.text.startsWith('골선'))).toBe(false);
  });

  it('시접 줄에 실제로 쓴 값을 적는다', () => {
    const items = legendItems(buildLayout({ widthMm: 270, depthMm: 100, heightMm: 140 }));
    expect(items.find((i) => i.text.startsWith('시접'))!.text).toContain('10mm');
  });

  it('모든 줄에 색 견본 class가 붙는다', () => {
    for (const item of legendItems(buildLayout({ widthMm: 270, depthMm: 100, heightMm: 140 }, 0))) {
      expect(item.swatch).toMatch(/^swatch-/);
    }
  });
});

describe('범례 색이 도면에 실제로 쓰인 색이다', () => {
  /*
   * 예전에는 견본 색이 style.css에, 선 색이 preview.ts에 따로 있었다.
   * 둘은 손으로 맞춰야 했고 주석으로만 묶여 있었다. 한쪽만 고치면 범례가
   * 도면과 다른 색을 가리키는데 아무도 못 잡는다.
   *
   * 이제 legendItems가 색까지 내주고 화면은 그걸 그대로 쓴다. 여기서는
   * 그 색이 정말 도면에 나타나는지 확인한다.
   */
  const cases = [
    { name: '시접 있음', layout: buildLayout({ widthMm: 270, depthMm: 100, heightMm: 140 }) },
    { name: '시접 없음', layout: buildLayout({ widthMm: 270, depthMm: 100, heightMm: 140 }, 0) },
    { name: '골선', layout: halveOnFold(buildLayout({ widthMm: 270, depthMm: 100, heightMm: 140 })) },
  ];

  it('모든 범례 줄이 색을 들고 있다', () => {
    for (const { layout } of cases) {
      for (const item of legendItems(layout)) {
        expect(item.color).toMatch(/^#[0-9a-f]{6}$/i);
      }
    }
  });

  it('그 색이 실제로 그려진 SVG 안에 있다', () => {
    for (const { name, layout } of cases) {
      const drawn = renderPreviewSvg(layout, paginate(layout, 'a4'));
      for (const item of legendItems(layout)) {
        expect(drawn.toLowerCase(), `${name}: ${item.text}`).toContain(item.color.toLowerCase());
      }
    }
  });

  it('면이 있는 견본은 채움색도 들고 있다', () => {
    const withSeam = legendItems(cases[0]!.layout);
    const band = withSeam.find((i) => i.text.startsWith('시접'))!;
    expect(band.fill).toMatch(/^#[0-9a-f]{6}$/i);
    const drawn = renderPreviewSvg(cases[0]!.layout, paginate(cases[0]!.layout, 'a4'));
    expect(drawn.toLowerCase()).toContain(band.fill!.toLowerCase());
  });

  it('선만 있는 견본은 채움색이 없다', () => {
    const cut = legendItems(cases[0]!.layout).find((i) => i.text.startsWith('재단선'))!;
    expect(cut.fill).toBeUndefined();
  });
});
