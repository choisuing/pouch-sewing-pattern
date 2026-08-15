import { DIMENSION_ORDER, FIELD_LABELS, RANGES, type DimensionField } from './constants';
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
  const values = {} as Record<DimensionField, number>;

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
  return {
    ok: true,
    value: { widthMm: values.widthMm, depthMm: values.depthMm, heightMm: values.heightMm },
  };
}

/** 도안에 찍는 이름. 화면 제목과 같은 말을 쓴다. */
export const PATTERN_NAME = '사각사각 지퍼 파우치';

/**
 * 도안에 찍을 한 줄. 이름과 치수를 붙인다.
 * 치수 순서는 화면·라벨과 같은 가로*높이*바닥폭이다.
 */
export function patternTitle(dimensions: Dimensions): string {
  const { widthMm: W, heightMm: H, depthMm: D } = dimensions;
  return `${PATTERN_NAME} ${W}*${H}*${D}`;
}
