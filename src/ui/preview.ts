// SPDX-License-Identifier: MIT
// Copyright (C) 2026 choisuing

import { centerXMm, patternTitlePointMm, type Layout, type Point } from '../core/layout';
import type { Pagination } from '../core/tiling';
import { patternTitle } from '../core/dimensions';

export function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * 인쇄 페이지 경계와 칸 번호. 화면 요약줄(--info)과 같은 청록 계열이라
 * "페이지"라는 개념이 한 색으로 묶인다. 회색으로 두면 접힘선과 헷갈린다.
 * 배경 #fbf7f0 위에서 5.04:1 — 선(3:1)과 글자(4.5:1) 기준을 모두 넘는다.
 */
const TILE_COLOR = '#2a7387';

/*
 * 완성선. 시접 바탕(#fce7f0)과 도안 채움(#fffdf5) 양쪽에서 3:1을 넘어야 한다.
 * 시접색을 바꾸면 여기도 다시 계산할 것.
 */
const SEAM_COLOR = '#94682f';
/** 골선. 접는 자리라 재단선·완성선과 섞이면 안 된다. */
const FOLD_EDGE_COLOR = '#b42318';
/** 세로 중앙선. 제도에서 중심선에 쓰는 일점쇄선으로 긋는다. */
const CENTER_COLOR = '#8a8175';

/*
 * 선 두께와 글자 크기는 도안 폭에 비례시킨다. mm 고정값으로 두면 작은 도안에서
 * 선이 굵고 글자가 커 보이고, 큰 도안에서는 반대가 된다. 화면에서 SVG 폭이
 * 컨테이너에 맞춰지므로 도안 폭이 곧 표시 배율이다.
 */
const CUT_STROKE_RATIO = 0.003;
const THIN_STROKE_RATIO = 0.002;
const BAND_LABEL_RATIO = 0.017;
const DIM_LABEL_RATIO = 0.015;
const TILE_LABEL_RATIO = 0.024;

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

const ORIENTATION_LABELS: Record<Pagination['orientation'], string> = {
  portrait: '세로',
  landscape: '가로',
};

/** 용지·방향·총 장수를 한 줄로 요약한다. 미리보기 위에 그대로 표시한다. */
export function describePagination(pagination: Pagination): string {
  const paper = pagination.paper.toUpperCase();
  const orientation = ORIENTATION_LABELS[pagination.orientation];
  return `${paper} ${orientation} · 총 ${pagination.pages.length}장 (${pagination.cols}열 × ${pagination.rows}행)`;
}

function toPolygonPoints(points: readonly Point[]): string {
  return points.map((p) => `${round1(p.xMm)},${round1(p.yMm)}`).join(' ');
}

function toClosedPath(points: readonly Point[]): string {
  const [first, ...rest] = points;
  if (first === undefined) return '';
  const head = `M ${round1(first.xMm)} ${round1(first.yMm)}`;
  const tail = rest.map((p) => `L ${round1(p.xMm)} ${round1(p.yMm)}`).join(' ');
  return `${head} ${tail} Z`;
}

export function renderPreviewSvg(layout: Layout, pagination: Pagination): string {
  const w = layout.totalWidthMm;
  const h = layout.totalHeightMm;

  const cutStroke = round1(w * CUT_STROKE_RATIO);
  const thinStroke = round1(w * THIN_STROKE_RATIO);
  const bandLabelSize = round1(w * BAND_LABEL_RATIO);
  const dimLabelSize = round1(w * DIM_LABEL_RATIO);
  const tileLabelSize = round1(w * TILE_LABEL_RATIO);
  const dash = (a: number, b: number) => `${round1(w * a)} ${round1(w * b)}`;

  const points = toPolygonPoints(layout.outlineMm);

  const tiles = pagination.pages
    .map((page) => {
      const tileW = Math.min(pagination.contentWidthMm, w - page.originXMm);
      const tileH = Math.min(pagination.contentHeightMm, h - page.originYMm);
      return `<rect class="page-tile" x="${round1(page.originXMm)}" y="${round1(page.originYMm)}" width="${round1(tileW)}" height="${round1(tileH)}" fill="none" stroke="${TILE_COLOR}" stroke-width="${thinStroke}" stroke-dasharray="${dash(0.023, 0.015)}" />`;
    })
    .join('');

  const tileLabels = pagination.pages
    .map(
      (page) =>
        `<text class="tile-label" x="${round1(page.originXMm + 4)}" y="${round1(page.originYMm + 14)}" font-size="${tileLabelSize}" fill="${TILE_COLOR}">${escapeXml(page.gridLabel)}</text>`,
    )
    .join('');

  // 재단선과 완성선을 두 개의 닫힌 경로로 묶고 evenodd로 채우면
  // 두 선 사이(=시접)만 칠해진다.
  const seamBand =
    `<path class="seam-band" d="${toClosedPath(layout.outlineMm)} ${toClosedPath(layout.seamLineMm)}"` +
    ` fill-rule="evenodd" fill="#fce7f0" fill-opacity="1" stroke="none" />`;

  const seamLine = `<polygon class="seam-line" points="${toPolygonPoints(layout.seamLineMm)}" fill="none" stroke="${SEAM_COLOR}" stroke-width="${thinStroke}" />`;

  /*
   * 골선. 절반만 남긴 전개도의 아래 변이다. 이 변은 자르는 선이 아니라
   * 원단 접은 자리에 얹는 선이라, 재단선과 헷갈리지 않게 따로 긋고 글자로 짚는다.
   */
  const foldEdge = (() => {
    const yMm = layout.foldEdgeYMm;
    if (yMm === undefined) return '';

    // 재봉 도안에서 쓰는 골선 기호. 반원 두 겹을 선 위에 얹는다.
    // 글자로 풀어 쓰지 않는 건 도안을 써 본 사람이면 아는 기호이기 때문이다.
    const arcs = [1, 1.5]
      .map((scale) => {
        const rMm = round1(bandLabelSize * scale);
        return `<path class="fold-edge-mark" d="M ${round1(w / 2 - rMm)},${round1(yMm)}` +
          ` A ${rMm},${rMm} 0 0 1 ${round1(w / 2 + rMm)},${round1(yMm)}"` +
          ` fill="none" stroke="${FOLD_EDGE_COLOR}" stroke-width="${thinStroke}" />`;
      })
      .join('');

    return `<line class="fold-edge" x1="0" y1="${round1(yMm)}"` +
      ` x2="${round1(w)}" y2="${round1(yMm)}"` +
      ` stroke="${FOLD_EDGE_COLOR}" stroke-width="${round1(cutStroke * 1.2)}" />` + arcs;
  })();

  /*
   * 세로 중앙선. 앞판·바닥의 가로 한가운데라 원단에 올릴 때 기준이 된다.
   * 선 종류가 이미 여럿이라 제도에서 중심선에 쓰는 일점쇄선으로 긋는다.
   * 모양만으로 갈리므로 색은 눈에 띄지 않는 회색이면 된다.
   */
  const centerLine =
    `<line class="center-line" x1="${round1(centerXMm(layout))}" y1="0"` +
    ` x2="${round1(centerXMm(layout))}" y2="${round1(h)}"` +
    ` stroke="${CENTER_COLOR}" stroke-width="${thinStroke}"` +
    ` stroke-dasharray="${dash(0.026, 0.012)} ${dash(0.004, 0.012)}" />`;

  /*
   * 도안 이름과 치수. 앞판 한가운데가 가장 넓게 비어 있다.
   * 미리보기에는 밴드 이름이 이미 그 자리에 있어 한 줄 아래로 내린다.
   */
  const titlePoint = patternTitlePointMm(layout);
  const patternTitleText =
    titlePoint === undefined
      ? ''
      : `<text class="pattern-title" x="${round1(titlePoint.xMm)}" y="${round1(titlePoint.yMm + bandLabelSize * 1.6)}"` +
        ` text-anchor="middle" dominant-baseline="middle" font-size="${bandLabelSize}" fill="#666">` +
        `${escapeXml(patternTitle(layout.dimensions))}</text>`;

  const labels = layout.bands
    .map(
      (band) =>
        `<text x="${round1(band.xMm + band.widthMm / 2)}" y="${round1(band.yMm + band.heightMm / 2)}" class="band-label" text-anchor="middle" dominant-baseline="middle" font-size="${bandLabelSize}" fill="#333">${escapeXml(band.label)}</text>`,
    )
    .join('');

  const dims =
    `<text x="${round1(w / 2)}" y="${round1(-w * 0.03)}" text-anchor="middle" font-size="${dimLabelSize}" fill="#555">${round1(w)}mm</text>` +
    `<text x="${round1(-w * 0.03)}" y="${round1(h / 2)}" text-anchor="middle" font-size="${dimLabelSize}" fill="#555" transform="rotate(-90 ${round1(-w * 0.03)} ${round1(h / 2)})">${round1(h)}mm</text>`;

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${round1(w)} ${round1(h)}"`,
    // overflow: visible은 viewBox 밖 치수 라벨을 보이게 하려는 것이고, 그 덕에
    // WebKit의 0폭 계산도 우연히 비켜 가 있었다. 폭을 직접 못 박아 우연에 기대지 않는다.
    ` style="overflow: visible; width: 100%; max-width: 100%; height: auto;" role="img"`,
    ` aria-label="${escapeXml(`가로 ${round1(w)}mm, 세로 ${round1(h)}mm 전개도 미리보기`)}">`,
    `<g transform="translate(0,0)">`,
    `<polygon points="${points}" fill="#fffdf5" stroke="#222" stroke-width="${cutStroke}" />`,
    seamBand,
    seamLine,
    // 페이지 경계는 도안 위에 얹어야 보인다. 도안 채움이 불투명해서
    // 먼저 그리면 가운데가 덮이고 밖으로 나온 끝부분만 남는다.
    tiles,
    tileLabels,
    centerLine,
    foldEdge,
    labels,
    patternTitleText,
    dims,
    `</g>`,
    `</svg>`,
  ].join('');
}
