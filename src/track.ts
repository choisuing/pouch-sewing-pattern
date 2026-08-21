// SPDX-License-Identifier: MIT
// Copyright (C) 2026 choisuing

import type { PaperSize } from './core/tiling';

/*
 * 다운로드 한 건을 기록으로 남긴다. 어떤 사이즈를 몇 명이 뽑아 가는지
 * 알아야 프리셋과 기본값을 손볼 근거가 생긴다.
 *
 * 받는 쪽은 구글 스프레드시트에 붙인 Apps Script 웹앱이다. 만드는 순서와
 * 붙여 넣을 코드는 docs/tracking.md에 있다.
 */

/** 한 건이 담는 값. 시각은 보내지 않는다 — 받는 쪽 시계를 믿는 편이 낫다. */
export interface TrackRecord {
  /** 탭 하나에 하나. 한 사람이 여러 번 받은 걸 한 사람으로 셀 수 있게 한다. */
  readonly sid: string;
  readonly w: number;
  readonly h: number;
  readonly d: number;
  readonly paper: PaperSize;
  /** 시접을 넣고 뽑았는지. 기본값이 실제로 쓰이는지 보려는 것이다. */
  readonly seam: boolean;
  /** 골선에서 반으로 접어 뽑았는지. */
  readonly fold: boolean;
}

export interface TrackInput {
  readonly sessionId: string;
  readonly widthMm: number;
  readonly heightMm: number;
  readonly depthMm: number;
  readonly paper: PaperSize;
  readonly seamMm: number;
  readonly foldHalf: boolean;
}

/**
 * 보낼 값을 만든다. 보내는 일과 떼어 놓아야 이 부분만 테스트할 수 있다.
 *
 * 치수는 입력한 그대로 남긴다. 여기서 구간으로 묶어 버리면 나중에 다른
 * 구간으로 다시 보고 싶어도 원래 값이 없다. 묶는 건 시트에서 하면 된다.
 */
export function trackRecord(input: TrackInput): TrackRecord {
  return {
    sid: input.sessionId,
    w: input.widthMm,
    h: input.heightMm,
    d: input.depthMm,
    paper: input.paper,
    seam: input.seamMm > 0,
    fold: input.foldHalf,
  };
}

const SESSION_KEY = 'pouch-sid';

/**
 * 탭 하나를 가리키는 임의의 문자열. sessionStorage에 두어 탭을 닫으면 사라진다.
 * 사람을 알아보려는 값이 아니라, 같은 탭에서 사이즈를 바꿔가며 세 번 받은 걸
 * 세 사람으로 세지 않으려는 값이다.
 */
export function sessionId(): string {
  try {
    const stored = sessionStorage.getItem(SESSION_KEY);
    if (stored !== null) return stored;
    const made = crypto.randomUUID();
    sessionStorage.setItem(SESSION_KEY, made);
    return made;
  } catch {
    // 사생활 보호 모드처럼 저장이 막힌 브라우저가 있다. 매번 새로 만들어
    // 보내면 그 사람은 받을 때마다 다른 사람으로 세일 뿐, 기능은 멀쩡하다.
    return crypto.randomUUID();
  }
}

/*
 * 받는 주소는 빌드할 때 넣는다. 저장소에 박아 두면 지나가다 줍기 너무 쉽다.
 * 값이 없으면 아래 함수는 아무 일도 하지 않는다 — 로컬 개발이나 남이 포크해
 * 빌드한 사이트가 이 시트를 더럽히지 않는다.
 */
const ENDPOINT = import.meta.env.VITE_TRACK_URL ?? '';

/** 주소가 없으면 보내지 않는다. */
export function trackingEnabled(endpoint: string = ENDPOINT): boolean {
  return endpoint !== '';
}

/**
 * 한 건을 보낸다. 실패해도 알리지 않는다 — 통계는 도구가 아니라서, 이것 때문에
 * 사용자에게 오류를 보여주거나 다운로드를 막을 이유가 없다.
 */
export function trackDownload(input: Omit<TrackInput, 'sessionId'>): void {
  if (!trackingEnabled()) return;

  let body: string;
  try {
    // crypto.randomUUID는 보안 컨텍스트(https·localhost)에서만 있다.
    // 없는 곳에서 부르면 던지므로 여기 안에서 부른다.
    body = JSON.stringify(trackRecord({ ...input, sessionId: sessionId() }));
  } catch {
    return;
  }

  try {
    /*
     * sendBeacon은 사전요청(preflight)을 부르지 않고, 다운로드하자마자 탭을
     * 닫아도 살아서 나간다. text/plain이어야 사전요청을 피할 수 있다.
     */
    const blob = new Blob([body], { type: 'text/plain;charset=UTF-8' });
    if (navigator.sendBeacon(ENDPOINT, blob)) return;
  } catch {
    // 아래 fetch로 한 번 더 해 본다.
  }

  try {
    void fetch(ENDPOINT, {
      method: 'POST',
      mode: 'no-cors',
      keepalive: true,
      headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
      body,
    }).catch(() => undefined);
  } catch {
    // 여기까지 실패하면 그냥 한 건을 잃는다.
  }
}
