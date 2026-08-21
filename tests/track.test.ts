import { describe, expect, it } from 'vitest';
import { trackingEnabled, trackRecord } from '../src/track';

/*
 * 보내는 일(sendBeacon·fetch)은 브라우저 것이라 여기서 못 본다.
 * 대신 "무엇을 보내는가"와 "언제 안 보내는가"를 지킨다. 시트에 쌓인 뒤에는
 * 되돌릴 수 없어서, 모양이 틀어지면 그날부터의 기록이 통째로 어긋난다.
 */

const base = {
  sessionId: 'abc-123',
  widthMm: 150,
  heightMm: 90,
  depthMm: 50,
  paper: 'a4' as const,
  seamMm: 10,
  foldHalf: false,
};

describe('trackRecord — 시트에 쌓일 한 줄', () => {
  it('치수를 입력한 그대로 남긴다', () => {
    // 구간으로 묶어 보내면 나중에 다른 구간으로 다시 볼 수 없다.
    const record = trackRecord({ ...base, widthMm: 173, heightMm: 88, depthMm: 41 });
    expect(record.w).toBe(173);
    expect(record.h).toBe(88);
    expect(record.d).toBe(41);
  });

  it('시접은 넣었는지 여부로 남긴다', () => {
    expect(trackRecord({ ...base, seamMm: 10 }).seam).toBe(true);
    expect(trackRecord({ ...base, seamMm: 0 }).seam).toBe(false);
  });

  it('용지와 반접기를 그대로 담는다', () => {
    const record = trackRecord({ ...base, paper: 'a3', foldHalf: true });
    expect(record.paper).toBe('a3');
    expect(record.fold).toBe(true);
  });

  it('탭 표시를 담는다', () => {
    // 이게 없으면 한 사람이 사이즈를 바꿔가며 세 번 받은 걸 세 명으로 센다.
    expect(trackRecord(base).sid).toBe('abc-123');
  });

  it('정해 둔 여덟 칸 말고는 아무것도 보내지 않는다', () => {
    // 시트 열 순서가 여기 맞춰져 있다. 늘리려면 시트도 함께 고칠 것.
    expect(Object.keys(trackRecord(base)).sort()).toEqual(
      ['d', 'fold', 'h', 'paper', 'seam', 'sid', 'w'].sort(),
    );
  });

  it('JSON으로 바꿔도 값이 그대로다', () => {
    expect(JSON.parse(JSON.stringify(trackRecord(base)))).toEqual(trackRecord(base));
  });
});

describe('trackingEnabled — 주소가 없으면 보내지 않는다', () => {
  it('빈 주소면 꺼진다', () => {
    // 로컬 개발과 남이 포크해 빌드한 사이트가 시트를 더럽히지 않게 하는 잠금이다.
    expect(trackingEnabled('')).toBe(false);
  });

  it('주소가 있으면 켜진다', () => {
    expect(trackingEnabled('https://script.google.com/macros/s/AKfy.../exec')).toBe(true);
  });
});
