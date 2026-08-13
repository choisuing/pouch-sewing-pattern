import { describe, expect, it } from 'vitest';
import { validateDimensions } from '../src/core/dimensions';
import { RANGES } from '../src/core/constants';

const valid = { widthMm: 270, depthMm: 100, heightMm: 140 };

describe('validateDimensions', () => {
  it('유효한 입력을 통과시킨다', () => {
    const result = validateDimensions(valid);
    expect(result).toEqual({ ok: true, value: valid });
  });

  it('각 입력의 최소·최대 경계를 정확히 적용한다', () => {
    for (const field of ['widthMm', 'depthMm', 'heightMm'] as const) {
      const { min, max } = RANGES[field];
      expect(validateDimensions({ ...valid, [field]: min }).ok).toBe(true);
      expect(validateDimensions({ ...valid, [field]: max }).ok).toBe(true);
      expect(validateDimensions({ ...valid, [field]: min - 1 }).ok).toBe(false);
      expect(validateDimensions({ ...valid, [field]: max + 1 }).ok).toBe(false);
    }
  });

  it('정수가 아닌 값을 거부한다', () => {
    const result = validateDimensions({ ...valid, depthMm: 100.5 });
    expect(result.ok).toBe(false);
  });

  it('숫자가 아니거나 비어 있는 값을 거부한다', () => {
    for (const bad of ['', null, undefined, 'abc', NaN]) {
      expect(validateDimensions({ ...valid, widthMm: bad }).ok).toBe(false);
    }
  });

  it('잘못된 필드를 모두 모아서 알려준다', () => {
    const result = validateDimensions({ widthMm: 10, depthMm: 10, heightMm: 10 });
    if (result.ok) throw new Error('거부되어야 한다');
    expect(result.errors.map((e) => e.field).sort()).toEqual(['depthMm', 'heightMm', 'widthMm']);
  });

  it('오류 메시지에 허용 범위를 담는다', () => {
    const result = validateDimensions({ ...valid, heightMm: 999 });
    if (result.ok) throw new Error('거부되어야 한다');
    expect(result.errors[0]?.message).toContain('60');
    expect(result.errors[0]?.message).toContain('300');
  });
});
