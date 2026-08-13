import { describe, expect, it } from 'vitest';
import { DIMENSION_ORDER, FIELD_LABELS, PRESETS } from '../src/core/constants';
import { validateDimensions } from '../src/core/dimensions';
import { formatPresetLabel } from '../src/ui/form';

describe('DIMENSION_ORDER', () => {
  it('가로 → 높이 → 바닥폭 순이다', () => {
    expect(DIMENSION_ORDER).toEqual(['widthMm', 'heightMm', 'depthMm']);
  });

  it('세 치수를 빠짐없이 한 번씩 담는다', () => {
    expect([...DIMENSION_ORDER].sort()).toEqual(['depthMm', 'heightMm', 'widthMm']);
  });

  it('모든 치수에 화면 표시용 이름이 있다', () => {
    for (const field of DIMENSION_ORDER) {
      expect(FIELD_LABELS[field]).toBeTruthy();
    }
  });
});

describe('formatPresetLabel', () => {
  it('확정한 순서대로 치수를 적는다', () => {
    expect(formatPresetLabel(PRESETS[0]!)).toBe('화장품 파우치 150×90×50');
    expect(formatPresetLabel(PRESETS[1]!)).toBe('생리대 파우치 120×70×70');
    expect(formatPresetLabel(PRESETS[2]!)).toBe('필통 200×50×50');
  });

  it('DIMENSION_ORDER를 따른다', () => {
    const preset = { id: 'x', label: '테스트', widthMm: 111, heightMm: 222, depthMm: 333 };
    const expected = DIMENSION_ORDER.map((field) => preset[field]).join('×');
    expect(formatPresetLabel(preset)).toBe(`테스트 ${expected}`);
  });
});

describe('validateDimensions — 오류 순서', () => {
  it('오류를 DIMENSION_ORDER 순으로 돌려준다', () => {
    const result = validateDimensions({ widthMm: 1, heightMm: 1, depthMm: 1 });
    if (result.ok) throw new Error('거부되어야 한다');
    expect(result.errors.map((e) => e.field)).toEqual([...DIMENSION_ORDER]);
  });
});
