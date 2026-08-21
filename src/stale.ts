// SPDX-License-Identifier: MIT
// Copyright (C) 2026 choisuing

import type { PaperSize } from './core/tiling';

/*
 * 배포가 지나간 뒤 낡은 화면을 스스로 되살린다.
 *
 * PDF 생성기는 무거워서 버튼을 누른 뒤에 따로 받아온다(main.ts). 그 조각의
 * 파일 이름에는 내용 해시가 붙는데, 새로 배포하면 이름이 바뀌고 옛 파일은
 * 지워진다. 그래서 배포 전에 열어 둔 화면은 다운로드를 누르는 순간
 * 없는 파일을 부르게 된다.
 *
 * 사람 눈에는 영문 오류 한 줄로 보인다. 파우치를 만들러 온 사람이 이걸
 * 보면 캐시를 지울 줄도 모르고 그냥 떠난다. 화면이 알아서 다시 뜨는 편이
 * 낫다 — 새로 뜨면 새 이름을 부르므로 저절로 낫는다.
 */

/** 새로 부를 때까지 들고 있을 화면 상태. 치수를 잃지 않으려는 것이다. */
export interface ScreenState {
  readonly widthMm: string;
  readonly heightMm: string;
  readonly depthMm: string;
  readonly paper: PaperSize;
  readonly addSeam: boolean;
  readonly foldHalf: boolean;
}

const STATE_KEY = 'pouch-stale-state';
const TRIED_KEY = 'pouch-stale-tried';

/*
 * 한 번 다시 부른 뒤 이만큼은 또 부르지 않는다. 새로고침해도 낫지 않는
 * 상황(망이 끊겼거나 조각이 정말 없는 경우)에 끝없이 도는 화면이 되지
 * 않게 막는 것이다.
 *
 * 영영 막지는 않는다. 오래 열어 둔 창이 나중에 또 배포를 만나면 그때는
 * 다시 살아나야 한다. 1분이면 낫지 않는 상황이라는 걸 알기에 충분하다.
 */
export const RETRY_WINDOW_MS = 60_000;

/*
 * 브라우저마다 말이 다르다. 하나로 맞춰 주는 표준이 없어 문구로 알아본다.
 *   크롬   Failed to fetch dynamically imported module
 *   사파리 Importing a module script failed
 *   파이어폭스 error loading dynamically imported module
 * 문구가 바뀌면 못 알아보지만, 그때는 예전처럼 오류가 보일 뿐 더 나빠지지 않는다.
 */
const SIGNS = [
  'dynamically imported module',
  'importing a module script failed',
  'error loading dynamically imported',
];

/** 배포가 지나가 조각을 못 찾는 오류인가. */
export function isStaleChunkError(error: unknown): boolean {
  const text = (error instanceof Error ? error.message : String(error)).toLowerCase();
  return SIGNS.some((sign) => text.includes(sign));
}

/**
 * 화면을 새로 부르기 직전에 상태를 맡긴다.
 *
 * 이미 한 번 새로 불렀는데도 또 같은 오류가 나면 맡기지 않는다. 그대로 두면
 * 끝없이 새로 부르는 화면이 된다. 그때는 부르는 쪽이 오류를 보여 준다.
 */
export function keepState(state: ScreenState, now: number = Date.now()): boolean {
  try {
    if (!canRetry(sessionStorage.getItem(TRIED_KEY), now)) return false;
    sessionStorage.setItem(TRIED_KEY, String(now));
    sessionStorage.setItem(STATE_KEY, JSON.stringify(state));
    return true;
  } catch {
    // 저장이 막힌 브라우저가 있다. 상태를 잃을 뿐 새로 부르는 건 할 수 있지만,
    // 끝없이 도는 걸 막을 방법이 없으므로 하지 않는다.
    return false;
  }
}

/**
 * 또 불러도 되는가. 표식이 없거나 충분히 오래됐으면 된다.
 *
 * 표식은 되살린 뒤에도 남겨 둔다. 상태와 함께 지워 버리면 새 화면은 자기가
 * 처음인 줄 알고 또 부르고, 그게 끝없이 이어진다.
 */
export function canRetry(triedAt: string | null, now: number): boolean {
  if (triedAt === null) return true;
  const at = Number(triedAt);
  if (!Number.isFinite(at)) return true;
  return now - at >= RETRY_WINDOW_MS;
}

/**
 * 맡긴 상태를 되찾는다. 한 번 꺼내면 지운다 — 남겨 두면 다음에 이 사이트를
 * 열었을 때 엉뚱하게 옛 치수가 들어차 있다.
 *
 * 다시 불렀다는 표식(TRIED_KEY)은 건드리지 않는다. 그건 시간이 지나야
 * 풀린다 — canRetry 참고.
 */
export function takeState(): ScreenState | undefined {
  try {
    const raw = sessionStorage.getItem(STATE_KEY);
    if (raw === null) return undefined;
    sessionStorage.removeItem(STATE_KEY);
    return parseState(raw);
  } catch {
    return undefined;
  }
}

/**
 * 맡겨 둔 글자를 상태로 되돌린다. 남이 손댔거나 예전 판이면 버린다 —
 * 모양이 안 맞는 값을 화면에 부으면 되살리려다 더 망가뜨린다.
 */
export function parseState(raw: string): ScreenState | undefined {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return undefined;
  }
  if (typeof value !== 'object' || value === null) return undefined;

  const v = value as Record<string, unknown>;
  const str = (x: unknown) => (typeof x === 'string' ? x : undefined);
  const bool = (x: unknown) => (typeof x === 'boolean' ? x : undefined);

  const widthMm = str(v['widthMm']);
  const heightMm = str(v['heightMm']);
  const depthMm = str(v['depthMm']);
  const paper = v['paper'] === 'a4' || v['paper'] === 'a3' ? v['paper'] : undefined;
  const addSeam = bool(v['addSeam']);
  const foldHalf = bool(v['foldHalf']);

  if (
    widthMm === undefined || heightMm === undefined || depthMm === undefined ||
    paper === undefined || addSeam === undefined || foldHalf === undefined
  ) {
    return undefined;
  }
  return { widthMm, heightMm, depthMm, paper, addSeam, foldHalf };
}
