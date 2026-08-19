// SPDX-License-Identifier: MIT
// Copyright (C) 2026 choisuing

import { DIMENSION_ORDER, FIELD_LABELS, RANGES, SEAM_MM, type DimensionField } from './constants';
import { withObjectParticle, withTopicParticle } from './korean';

export interface Dimensions {
  readonly widthMm: number;
  readonly depthMm: number;
  readonly heightMm: number;
}

export interface FieldError {
  readonly field: DimensionField;
  readonly message: string;
}

export type ValidationResult =
  | { readonly ok: true; readonly value: Dimensions }
  | { readonly ok: false; readonly errors: readonly FieldError[] };

export function validateDimensions(input: Record<DimensionField, unknown>): ValidationResult {
  const errors: FieldError[] = [];
  // 검사 전에는 아무 값도 없으므로 Partial로 시작한다. 빈 객체를 완성된
  // Record인 척 단언하면 아래에서 값이 빠진 경우를 타입이 못 잡는다.
  const values: Partial<Record<DimensionField, number>> = {};

  for (const field of DIMENSION_ORDER) {
    const raw = input[field];
    const { min, max } = RANGES[field];
    const label = FIELD_LABELS[field];
    const num = typeof raw === 'number' ? raw : Number(raw);

    if (raw === '' || raw === null || raw === undefined || !Number.isFinite(num)) {
      errors.push({ field, message: `${withObjectParticle(label)} 숫자로 입력해주세요.` });
      continue;
    }
    if (!Number.isInteger(num)) {
      errors.push({ field, message: `${withTopicParticle(label)} 1mm 단위 정수로 입력해주세요.` });
      continue;
    }
    if (num < min || num > max) {
      errors.push({ field, message: `${withTopicParticle(label)} ${min}mm 이상 ${max}mm 이하여야 합니다.` });
      continue;
    }
    values[field] = num;
  }

  if (errors.length > 0) return { ok: false, errors };

  // 오류가 없으면 세 값이 모두 채워져 있다. 다만 타입만으로는 그걸 알 수
  // 없으므로 단언 대신 실제로 확인한다. 필드가 늘었는데 검사 루프에서
  // 빠지는 경우를 여기서 잡는다.
  const { widthMm, depthMm, heightMm } = values;
  if (widthMm === undefined || depthMm === undefined || heightMm === undefined) {
    throw new Error('치수 검사를 통과했는데 값이 비어 있습니다.');
  }
  return { ok: true, value: { widthMm, depthMm, heightMm } };
}

/** 도안에 찍는 이름. 화면 제목과 같은 말을 쓴다. */
export const PATTERN_NAME = '사각사각 지퍼 파우치';

/**
 * 도안에 찍을 한 줄. 이름과 치수를 붙인다.
 * 치수 순서는 화면·라벨과 같은 가로*높이*바닥폭이다.
 *
 * 시접 없이 뽑았으면 그렇다고 못 박는다. 종이만 따로 돌아다니면 화면을
 * 볼 수 없고, 모르고 재단하면 원단을 버린다.
 */
export function patternTitle(dimensions: Dimensions, seamMm: number = SEAM_MM): string {
  const { widthMm: W, heightMm: H, depthMm: D } = dimensions;
  const base = `${PATTERN_NAME} ${W}*${H}*${D}`;
  return seamMm === 0 ? `${base} 시접없음` : base;
}

/**
 * 내려받는 PDF의 파일 이름.
 *
 * 치수 순서는 patternTitle과 같은 가로x높이x바닥폭이다. 파일을 여러 개
 * 받아 두었을 때 이름과 도안 속 글자가 다른 순서면 어느 쪽이 맞는지
 * 알 수 없다.
 */
export function patternFileName(
  dimensions: Dimensions,
  paper: string,
  foldHalf: boolean,
  seamMm: number = SEAM_MM,
): string {
  const { widthMm: W, heightMm: H, depthMm: D } = dimensions;
  // 같은 치수를 골선·시접 조합만 바꿔 여러 번 받아 두면 이름이 같아진다.
  const half = foldHalf ? '-half' : '';
  const seam = seamMm === 0 ? '-noseam' : '';
  return `box-pouch-${W}x${H}x${D}-${paper}${half}${seam}.pdf`;
}
