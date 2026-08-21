# 다운로드 기록

어떤 사이즈를 몇 명이 뽑아 가는지 남긴다. 프리셋과 기본값을 손볼 때
짐작 대신 근거를 쓰려는 것이다.

받는 쪽은 구글 스프레드시트에 붙인 Apps Script 웹앱이다. 서버가 따로 없는
정적 사이트라 값을 받아 적을 곳이 바깥에 있어야 한다.

## 남기는 것

한 번 받을 때마다 한 줄이 쌓인다.

| 열 | 값 | 왜 |
|---|---|---|
| `시각` | 받은 쪽 서버 시각 | 보낸 쪽 시계를 믿지 않는다 |
| `탭` | 탭마다 하나인 임의의 문자열 | 한 사람이 세 번 받은 걸 세 명으로 세지 않으려고 |
| `가로` `높이` `바닥폭` | 입력한 그대로 (mm) | 구간으로 묶는 건 시트에서 하면 된다 |
| `용지` | `a4` / `a3` | 기본값이 맞는지 본다 |
| `시접` | `TRUE` / `FALSE` | 시접 없이 뽑는 사람이 얼마나 되는지 |
| `반접기` | `TRUE` / `FALSE` | 골선 반접기를 실제로 쓰는지 |

이름도 주소도 브라우저 정보도 남기지 않는다. `탭` 값은 `sessionStorage`에만
있어서 탭을 닫으면 사라지고, 같은 사람이 내일 다시 와도 다른 값이 된다.
사람을 알아보는 값이 아니라 한 번 앉은 자리를 묶는 값이다.

## 만드는 순서

### 1. 시트를 만든다

새 스프레드시트를 만들고 시트 이름(아래쪽 탭)을 `log`로 바꾼다.
첫 줄에 머리글을 넣는다:

```
시각	탭	가로	높이	바닥폭	용지	시접	반접기
```

### 2. Apps Script를 붙인다

시트에서 **확장 프로그램 → Apps Script**. 기본으로 들어 있는 코드를 지우고
아래를 통째로 붙여 넣은 뒤 저장한다.

```javascript
// 사각 파우치 도안 생성기 — 다운로드 기록 받는 곳
// 붙일 시트: 이름이 'log'인 시트, 머리글 8칸

var SHEET_NAME = 'log';

function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);
    if (!valid(data)) return ok();

    // 여러 사람이 동시에 받으면 같은 줄에 겹쳐 쓸 수 있다. 자물쇠로 줄을 세운다.
    var lock = LockService.getScriptLock();
    lock.waitLock(20000);
    try {
      SpreadsheetApp.getActiveSpreadsheet()
        .getSheetByName(SHEET_NAME)
        .appendRow([
          new Date(),
          String(data.sid).slice(0, 40),
          data.w,
          data.h,
          data.d,
          data.paper,
          data.seam === true,
          data.fold === true,
        ]);
    } finally {
      lock.releaseLock();
    }
  } catch (err) {
    // 보낸 쪽은 답을 읽지 않는다. 오류를 되돌려 봐야 아무도 못 본다.
  }
  return ok();
}

/*
 * 주소를 아는 사람은 누구나 아무 값이나 쏠 수 있다. 막을 수는 없지만,
 * 도구가 실제로 만들 수 있는 값만 받아 적어 시트가 쓰레기로 차는 건 늦춘다.
 * 범위는 src/core/constants.ts의 RANGES와 같다.
 */
function valid(d) {
  return d
    && num(d.w, 100, 400)
    && num(d.h, 50, 300)
    && num(d.d, 40, 200)
    && (d.paper === 'a4' || d.paper === 'a3');
}

function num(v, min, max) {
  return typeof v === 'number' && isFinite(v) && v >= min && v <= max;
}

function ok() {
  return ContentService.createTextOutput('ok');
}
```

### 3. 웹앱으로 배포한다

오른쪽 위 **배포 → 새 배포**.

- 유형: **웹 앱**
- 실행 계정: **나**
- 액세스 권한: **모든 사용자** ← 이걸 빼먹으면 아무 기록도 안 들어온다

배포하면 `https://script.google.com/macros/s/…/exec`로 끝나는 주소가 나온다.
**이 주소가 필요한 것이다.** 시트 링크가 아니다.

### 4. 저장소에 주소를 넣는다

GitHub 저장소 → **Settings → Secrets and variables → Actions → New repository
secret**. 이름은 `TRACK_URL`, 값은 방금 복사한 `/exec` 주소.

또는 터미널에서:

```sh
gh secret set TRACK_URL
```

다음 배포부터 기록이 쌓인다. `main`에 아무거나 밀거나 Actions 탭에서
`Deploy to GitHub Pages`를 직접 돌리면 된다.

## 코드를 고칠 때

Apps Script를 고쳤으면 **배포 → 배포 관리 → 연필 → 버전: 새 버전**으로
다시 배포해야 반영된다. 저장만 해서는 웹앱이 그대로다. 이때 주소는
바뀌지 않으니 Secret은 손대지 않아도 된다.

## 로컬에서 시험하기

저장소 뿌리에 `.env.local`을 만든다. `.gitignore`에 걸려 있어 올라가지 않는다.

```
VITE_TRACK_URL=https://script.google.com/macros/s/…/exec
```

`npm run dev`로 띄우고 PDF를 받으면 시트에 줄이 생긴다. 시험한 줄은 지워 둘 것.

이 파일이 없으면 트래킹은 통째로 잠잔다. 남이 포크해 빌드한 사이트도
마찬가지라 이 시트를 더럽히지 않는다.

## 통계 뽑기

시트에서 **삽입 → 피벗 테이블**.

- **사이즈별 인기**: 행에 `가로`·`높이`·`바닥폭`, 값에 `탭`을 **고유 개수**로
- **몇 명 / 몇 번**: 값에 `탭`을 고유 개수(=몇 명)와 개수(=몇 번)로 나란히
- **구간으로 보기**: 빈 열에 `=FLOOR(C2,50)` 같은 식을 붙여 50mm 단위로 묶은
  뒤 그 열로 피벗한다. 원본 치수는 그대로 남아 있어 언제든 다른 구간으로
  다시 볼 수 있다

## 한계

주소를 아는 사람은 누구나 값을 쏠 수 있고, 이 방식으로는 막을 수 없다.
지금 규모에서는 실제로 그럴 일이 거의 없다. 시트에 이상한 줄이 쌓이기
시작하면 Cloudflare Workers처럼 제대로 된 API로 옮길 때다.

광고 차단기가 `sendBeacon`을 막는 경우가 있어 실제 다운로드보다 적게 잡힌다.
절대 수보다 사이즈끼리의 비율을 보는 편이 낫다.
