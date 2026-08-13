import { describe, expect, it } from 'vitest';
import { withObjectParticle, withTopicParticle } from '../src/core/korean';

describe('withTopicParticle (은/는)', () => {
  it('받침이 있으면 은을 붙인다', () => {
    expect(withTopicParticle('바닥폭')).toBe('바닥폭은');
    expect(withTopicParticle('지퍼단')).toBe('지퍼단은');
  });

  it('받침이 없으면 는을 붙인다', () => {
    expect(withTopicParticle('가로')).toBe('가로는');
    expect(withTopicParticle('높이')).toBe('높이는');
  });
});

describe('withObjectParticle (을/를)', () => {
  it('받침이 있으면 을을 붙인다', () => {
    expect(withObjectParticle('바닥폭')).toBe('바닥폭을');
  });

  it('받침이 없으면 를을 붙인다', () => {
    expect(withObjectParticle('가로')).toBe('가로를');
    expect(withObjectParticle('높이')).toBe('높이를');
  });
});

describe('조사 선택 — 경계', () => {
  it('한글이 아닌 글자로 끝나면 받침 없는 쪽을 쓴다', () => {
    expect(withTopicParticle('A4')).toBe('A4는');
    expect(withObjectParticle('size')).toBe('size를');
  });

  it('빈 문자열이어도 터지지 않는다', () => {
    expect(withTopicParticle('')).toBe('는');
    expect(withObjectParticle('')).toBe('를');
  });
});
