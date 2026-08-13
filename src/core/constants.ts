/** 시접 (mm). 도안 치수에 이미 포함되므로 사용자가 따로 더하지 않는다. */
export const SEAM_MM = 10;

/** 지퍼가 차지하는 폭 (mm). 윗단 밴드 높이에서 절반씩 빠진다. */
export const ZIPPER_ALLOWANCE_MM = 10;

export type DimensionField = 'widthMm' | 'depthMm' | 'heightMm';

export interface Range {
  readonly min: number;
  readonly max: number;
}

export const RANGES: Record<DimensionField, Range> = {
  widthMm: { min: 100, max: 400 },
  depthMm: { min: 40, max: 200 },
  heightMm: { min: 60, max: 300 },
};

export const FIELD_LABELS: Record<DimensionField, string> = {
  widthMm: '가로',
  depthMm: '세로(바닥폭)',
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
  { id: 'pencil', label: '필통', widthMm: 200, depthMm: 60, heightMm: 60 },
  { id: 'cosmetic', label: '화장품 파우치', widthMm: 220, depthMm: 90, heightMm: 130 },
  { id: 'travel', label: '여행 파우치', widthMm: 270, depthMm: 100, heightMm: 140 },
];
