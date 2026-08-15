// SPDX-License-Identifier: MIT
// Copyright (C) 2026 choisuing

/** 시접 (mm). 도안 치수에 이미 포함되므로 사용자가 따로 더하지 않는다. */
export const SEAM_MM = 10;

/** 지퍼가 차지하는 폭 (mm). 윗단 밴드 높이에서 절반씩 빠진다. */
export const ZIPPER_ALLOWANCE_MM = 10;

export type DimensionField = 'widthMm' | 'depthMm' | 'heightMm';

/**
 * 치수를 사람에게 보여주는 순서. 입력칸 배치, 프리셋 표기, 오류 메시지가
 * 모두 이 순서를 따른다. 순서를 바꾸려면 여기만 고친다.
 */
export const DIMENSION_ORDER: readonly DimensionField[] = ['widthMm', 'heightMm', 'depthMm'];

export interface Range {
  readonly min: number;
  readonly max: number;
}

/**
 * 높이 최소값은 `4 × SEAM_MM`(=40)보다 커야 한다. 앞판 높이가 `H − 2S`이고
 * 거기서 완성선이 위아래로 다시 `S`씩 들어가므로, 40 이하가 되면 완성선이
 * 무너진다. tests/layout.test.ts의 "허용 최소 치수" 테스트가 이를 지킨다.
 */
export const RANGES: Record<DimensionField, Range> = {
  widthMm: { min: 100, max: 400 },
  depthMm: { min: 40, max: 200 },
  heightMm: { min: 50, max: 300 },
};

export const FIELD_LABELS: Record<DimensionField, string> = {
  widthMm: '가로',
  depthMm: '바닥폭',
  heightMm: '높이',
};

export interface Preset {
  readonly id: string;
  readonly label: string;
  readonly widthMm: number;
  readonly depthMm: number;
  readonly heightMm: number;
}

export const PRESETS: readonly Preset[] = [
  { id: 'pencil', label: '필통', widthMm: 200, heightMm: 50, depthMm: 50 },
  { id: 'sanitary', label: '생리대 파우치', widthMm: 120, heightMm: 70, depthMm: 40 },
  { id: 'cosmetic', label: '화장품 파우치', widthMm: 150, heightMm: 90, depthMm: 50 },
];
