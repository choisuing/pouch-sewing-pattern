import { describe, expect, it } from 'vitest';
import { canRetry, isStaleChunkError, parseState, RETRY_WINDOW_MS } from '../src/stale';

/*
 * 배포가 지나간 화면을 스스로 되살리는 부분. sessionStorage를 만지는 쪽은
 * 브라우저 것이라 여기서 못 본다. 알아보는 눈과 되돌리는 눈만 지킨다.
 */

describe('isStaleChunkError — 배포가 지나간 오류를 알아본다', () => {
  it('크롬 문구를 알아본다', () => {
    expect(isStaleChunkError(new Error(
      'Failed to fetch dynamically imported module: https://silsuni-lab.github.io/assets/pdf-BKfdVt8E.js',
    ))).toBe(true);
  });

  it('사파리 문구를 알아본다', () => {
    expect(isStaleChunkError(new Error('Importing a module script failed.'))).toBe(true);
  });

  it('파이어폭스 문구를 알아본다', () => {
    expect(isStaleChunkError(new Error('error loading dynamically imported module'))).toBe(true);
  });

  it('Error가 아닌 것도 받는다', () => {
    // 던져지는 것이 Error라는 보장이 없다.
    expect(isStaleChunkError('Failed to fetch dynamically imported module')).toBe(true);
  });

  it('다른 오류는 건드리지 않는다', () => {
    // 이게 참이 되면 엉뚱한 오류에도 화면을 다시 불러 사람을 놀래킨다.
    expect(isStaleChunkError(new Error('폰트를 읽지 못했습니다'))).toBe(false);
    expect(isStaleChunkError(new Error('Out of memory'))).toBe(false);
    expect(isStaleChunkError(undefined)).toBe(false);
  });
});

describe('parseState — 맡겨 둔 값을 되돌린다', () => {
  const good = {
    widthMm: '270', heightMm: '140', depthMm: '100',
    paper: 'a3', addSeam: false, foldHalf: true,
  };

  it('맡긴 그대로 돌려준다', () => {
    expect(parseState(JSON.stringify(good))).toEqual(good);
  });

  it('치던 글자를 숫자로 바꾸지 않는다', () => {
    // 지우다 만 빈칸이 0이 되면 화면에 없던 값이 생긴다.
    expect(parseState(JSON.stringify({ ...good, widthMm: '' }))?.widthMm).toBe('');
  });

  it('모양이 안 맞으면 버린다', () => {
    // 되살리려다 더 망가뜨리느니 첫 프리셋으로 시작하는 편이 낫다.
    expect(parseState('{')).toBeUndefined();
    expect(parseState('null')).toBeUndefined();
    expect(parseState('"a4"')).toBeUndefined();
    expect(parseState(JSON.stringify({ ...good, paper: 'a5' }))).toBeUndefined();
    expect(parseState(JSON.stringify({ ...good, addSeam: 'true' }))).toBeUndefined();
    expect(parseState(JSON.stringify({ ...good, widthMm: 270 }))).toBeUndefined();
    const { foldHalf: _, ...missing } = good;
    expect(parseState(JSON.stringify(missing))).toBeUndefined();
  });
});

describe('canRetry — 끝없이 다시 부르지 않는다', () => {
  const now = 1_700_000_000_000;

  it('처음이면 부른다', () => {
    expect(canRetry(null, now)).toBe(true);
  });

  it('방금 불렀으면 또 부르지 않는다', () => {
    /*
     * 이게 참이 되면 새로고침해도 낫지 않는 상황에서 화면이 끝없이 돈다.
     * 되살린 화면은 표식을 지우지 않으므로 자기가 처음인 줄 알면 안 된다.
     */
    expect(canRetry(String(now), now)).toBe(false);
    expect(canRetry(String(now - RETRY_WINDOW_MS + 1), now)).toBe(false);
  });

  it('충분히 지났으면 다시 부른다', () => {
    // 오래 열어 둔 창이 나중에 또 배포를 만나면 그때는 살아나야 한다.
    expect(canRetry(String(now - RETRY_WINDOW_MS), now)).toBe(true);
    expect(canRetry(String(now - 3_600_000), now)).toBe(true);
  });

  it('표식이 망가졌으면 처음인 것으로 본다', () => {
    expect(canRetry('어제', now)).toBe(true);
  });
});
