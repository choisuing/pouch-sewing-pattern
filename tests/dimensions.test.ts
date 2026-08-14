import { describe, expect, it } from 'vitest';
import { validateDimensions } from '../src/core/dimensions';
import { PRESETS, RANGES } from '../src/core/constants';

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
    expect(result.errors[0]?.message).toContain(String(RANGES.heightMm.min));
    expect(result.errors[0]?.message).toContain(String(RANGES.heightMm.max));
  });
});

describe('PRESETS', () => {
  it('요청받은 세 가지 프리셋을 제공한다', () => {
    expect(PRESETS.map((p) => [p.label, p.widthMm, p.heightMm, p.depthMm])).toEqual([
      ['필통', 200, 50, 50],
      ['생리대 파우치', 120, 70, 40],
      ['화장품 파우치', 150, 90, 50],
    ]);
  });

  it('모든 프리셋이 입력 검증을 통과한다', () => {
    for (const preset of PRESETS) {
      const result = validateDimensions({
        widthMm: preset.widthMm,
        depthMm: preset.depthMm,
        heightMm: preset.heightMm,
      });
      if (!result.ok) {
        throw new Error(`${preset.label}: ${result.errors.map((e) => e.message).join(' ')}`);
      }
      expect(result.ok).toBe(true);
    }
  });

  it('프리셋 id가 서로 겹치지 않는다', () => {
    const ids = PRESETS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('오류 메시지 — 한국어 조사', () => {
  const messageFor = (field: 'widthMm' | 'heightMm' | 'depthMm', value: unknown) => {
    const base = { widthMm: 150, heightMm: 90, depthMm: 50 };
    const result = validateDimensions({ ...base, [field]: value });
    if (result.ok) throw new Error('거부되어야 한다');
    return result.errors[0]!.message;
  };

  it('받침 있는 이름에 은/을을 쓴다', () => {
    expect(messageFor('depthMm', 9999)).toContain('바닥폭은');
    expect(messageFor('depthMm', 'abc')).toContain('바닥폭을');
    expect(messageFor('depthMm', 50.5)).toContain('바닥폭은');
  });

  it('받침 없는 이름에 는/를을 쓴다', () => {
    expect(messageFor('widthMm', 9999)).toContain('가로는');
    expect(messageFor('widthMm', 'abc')).toContain('가로를');
    expect(messageFor('heightMm', 9999)).toContain('높이는');
  });

  it('어떤 메시지에도 잘못된 조사가 남지 않는다', () => {
    for (const field of ['widthMm', 'heightMm', 'depthMm'] as const) {
      for (const bad of [9999, 'abc', 1.5]) {
        const message = messageFor(field, bad);
        expect(message).not.toMatch(/폭는|폭를/);
      }
    }
  });
});
