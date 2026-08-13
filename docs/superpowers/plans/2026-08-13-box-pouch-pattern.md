# 사각 파우치 도안 생성기 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 완성 치수 세 개(가로·세로·높이)를 입력하면 사각 파우치 전개도를 1:1 실치수 타일링 PDF로 내려받는 정적 웹 도구를 만든다.

**Architecture:** 도안 계산·페이지 분할·PDF 생성은 DOM을 전혀 참조하지 않는 `src/core/` 순수 모듈에 두고, `src/ui/`가 그 위에서 SVG 미리보기와 입력 폼을 담당한다. 의존은 `ui → core` 단방향이며, 미리보기와 PDF가 동일한 `Layout`·`Pagination` 객체를 소비하므로 화면과 출력이 어긋날 수 없다.

**Tech Stack:** Vite 6, TypeScript 5, pdf-lib 1.17, vitest 2. 프레임워크 없음.

## Global Constraints

- 모든 길이 단위는 **mm**이며, PDF 출력 직전에만 pt로 변환한다 (1mm = 2.83465pt).
- 시접 `S` = 10mm, 지퍼 차감 `Z` = 10mm. **상수로 고정**하며 UI에 노출하지 않는다.
- 입력은 **정수 mm만** 받는다. 내부 계산과 좌표는 **반올림하지 않는다** — `D`가 홀수면 0.5mm가 생기며, 반올림하면 "밴드 높이 합 = 전체 높이" 불변식이 깨진다. 반올림은 화면·도면에 치수를 표시할 때만, 소수 첫째 자리까지 적용한다.
- 입력 허용 범위: `W` 100~400, `D` 40~200, `H` 60~300 (mm).
- 외부 CDN·웹폰트·외부 API를 사용하지 않는다. 네트워크 요청 코드를 작성하지 않는다.
- Vite `base: './'` — 하위 경로 배포에서도 동작해야 한다.
- 사용자 추적·분석 코드를 넣지 않는다.
- UI 문구는 한국어로 작성한다.
- 좌표계는 전개도 좌상단이 원점 `(0, 0)`, x는 오른쪽, y는 아래 방향이다.

---

## 파일 구조

| 파일 | 책임 |
|---|---|
| `package.json` | 의존성·스크립트 |
| `tsconfig.json` | TypeScript 설정 |
| `vite.config.ts` | 빌드 설정 (`base: './'`), vitest 설정 |
| `index.html` | 진입 HTML, 정적 폼 골격 |
| `src/core/constants.ts` | 시접·지퍼 상수, 입력 범위, 프리셋, 용지 규격 |
| `src/core/dimensions.ts` | 입력 검증 → `Dimensions` |
| `src/core/layout.ts` | `Dimensions` → `Layout` (밴드·외곽선·접힘선, mm) |
| `src/core/tiling.ts` | `Layout` + 용지 → `Pagination` (페이지 분할) |
| `src/core/pdf.ts` | `Layout` + `Pagination` → PDF 바이트 |
| `src/ui/preview.ts` | `Layout` + `Pagination` → SVG 문자열 |
| `src/ui/form.ts` | 입력칸·프리셋·용지 선택 DOM 처리 |
| `src/main.ts` | 조립, 이벤트 배선, 에러 표시 |
| `src/style.css` | 스타일 |
| `tests/*.test.ts` | 모듈별 테스트 |

`core`의 어떤 파일도 `document`·`window`·`fetch`를 참조하지 않는다.

---

## Task 1: 프로젝트 스캐폴딩과 입력 검증

**Files:**
- Create: `package.json`, `tsconfig.json`, `vite.config.ts`, `.gitignore`
- Create: `src/core/constants.ts`, `src/core/dimensions.ts`
- Test: `tests/dimensions.test.ts`

**Interfaces:**
- Consumes: 없음 (첫 작업)
- Produces:
  - `SEAM_MM: number`, `ZIPPER_ALLOWANCE_MM: number`
  - `RANGES: Record<'widthMm'|'depthMm'|'heightMm', {min: number, max: number}>`
  - `PRESETS: Preset[]`, `interface Preset { id: string; label: string; widthMm: number; depthMm: number; heightMm: number }`
  - `interface Dimensions { widthMm: number; depthMm: number; heightMm: number }`
  - `type DimensionField = 'widthMm' | 'depthMm' | 'heightMm'`
  - `interface FieldError { field: DimensionField; message: string }`
  - `type ValidationResult = { ok: true; value: Dimensions } | { ok: false; errors: FieldError[] }`
  - `validateDimensions(input: Record<DimensionField, unknown>): ValidationResult`

- [ ] **Step 1: 프로젝트 초기화**

```bash
cd /Users/choisuing/claude/box-pouch-pattern
npm init -y
npm install --save pdf-lib@^1.17.1
npm install --save-dev vite@^6.0.0 typescript@^5.6.0 vitest@^2.1.0
```

- [ ] **Step 2: 설정 파일 작성**

`package.json`의 `scripts`를 아래로 교체한다 (`"type": "module"`도 추가):

```json
{
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc --noEmit && vite build",
    "preview": "vite preview",
    "test": "vitest run",
    "test:watch": "vitest"
  }
}
```

`tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2022", "DOM"],
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noEmit": true,
    "isolatedModules": true,
    "skipLibCheck": true
  },
  "include": ["src", "tests", "vite.config.ts"]
}
```

`vite.config.ts`:

```ts
// vitest 설정을 함께 두므로 'vite'가 아니라 'vitest/config'에서 defineConfig를 가져온다.
// 'vite'의 defineConfig에는 test 필드 타입이 없어 `tsc --noEmit`이 실패한다.
import { defineConfig } from 'vitest/config';

export default defineConfig({
  base: './',
  test: {
    environment: 'node',
  },
});
```

`.gitignore`:

```
node_modules/
dist/
```

- [ ] **Step 3: 실패하는 테스트 작성**

`tests/dimensions.test.ts`:

```ts
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
```

- [ ] **Step 4: 테스트가 실패하는지 확인**

Run: `npm test`
Expected: FAIL — `Failed to resolve import "../src/core/dimensions"`

- [ ] **Step 5: constants.ts 작성**

```ts
/** 시접 (mm). 도안 치수에 이미 포함되므로 사용자가 따로 더하지 않는다. */
export const SEAM_MM = 10;

/** 지퍼가 차지하는 폭 (mm). 윗단 밴드 높이에서 절반씩 빠진다. */
export const ZIPPER_ALLOWANCE_MM = 10;

export type DimensionField = 'widthMm' | 'depthMm' | 'heightMm';

export interface Range {
  readonly min: number;
  readonly max: number;
}

export const RANGES: Record<DimensionField, Range> = {
  widthMm: { min: 100, max: 400 },
  depthMm: { min: 40, max: 200 },
  heightMm: { min: 60, max: 300 },
};

export const FIELD_LABELS: Record<DimensionField, string> = {
  widthMm: '가로',
  depthMm: '세로(바닥폭)',
  heightMm: '높이',
};

export interface Preset {
  readonly id: string;
  readonly label: string;
  readonly widthMm: number;
  readonly depthMm: number;
  readonly heightMm: number;
}

export const PRESETS: readonly Preset[] = [
  { id: 'pencil', label: '필통', widthMm: 200, depthMm: 60, heightMm: 60 },
  { id: 'cosmetic', label: '화장품 파우치', widthMm: 220, depthMm: 90, heightMm: 130 },
  { id: 'travel', label: '여행 파우치', widthMm: 270, depthMm: 100, heightMm: 140 },
];
```

- [ ] **Step 6: dimensions.ts 작성**

```ts
import { FIELD_LABELS, RANGES, type DimensionField } from './constants';

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

const FIELDS: readonly DimensionField[] = ['widthMm', 'depthMm', 'heightMm'];

export function validateDimensions(input: Record<DimensionField, unknown>): ValidationResult {
  const errors: FieldError[] = [];
  const values = {} as Record<DimensionField, number>;

  for (const field of FIELDS) {
    const raw = input[field];
    const { min, max } = RANGES[field];
    const label = FIELD_LABELS[field];
    const num = typeof raw === 'number' ? raw : Number(raw);

    if (raw === '' || raw === null || raw === undefined || !Number.isFinite(num)) {
      errors.push({ field, message: `${label}를 숫자로 입력해주세요.` });
      continue;
    }
    if (!Number.isInteger(num)) {
      errors.push({ field, message: `${label}는 1mm 단위 정수로 입력해주세요.` });
      continue;
    }
    if (num < min || num > max) {
      errors.push({ field, message: `${label}는 ${min}mm 이상 ${max}mm 이하여야 합니다.` });
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
```

- [ ] **Step 7: 테스트 통과 확인**

Run: `npm test`
Expected: PASS — 6개 테스트 통과

- [ ] **Step 8: 커밋**

```bash
git add -A
git commit -m "프로젝트 스캐폴딩과 입력 검증 추가"
```

---

## Task 2: 전개도 밴드 계산

**Files:**
- Create: `src/core/layout.ts`
- Test: `tests/layout.test.ts`

**Interfaces:**
- Consumes: `Dimensions` (Task 1), `SEAM_MM`, `ZIPPER_ALLOWANCE_MM` (Task 1)
- Produces:
  - `type BandId = 'topFront' | 'front' | 'bottom' | 'back' | 'topBack'`
  - `interface Band { id: BandId; label: string; xMm: number; yMm: number; widthMm: number; heightMm: number }`
  - `interface Layout { dimensions: Dimensions; totalWidthMm: number; totalHeightMm: number; sideInsetMm: number; bands: Band[]; outlineMm: Point[]; foldLinesMm: Line[] }`
  - `interface Point { xMm: number; yMm: number }`
  - `interface Line { x1Mm: number; y1Mm: number; x2Mm: number; y2Mm: number }`
  - `buildLayout(dimensions: Dimensions): Layout`

이 작업에서는 `bands`, `totalWidthMm`, `totalHeightMm`, `sideInsetMm`만 채운다. `outlineMm`과 `foldLinesMm`은 Task 3에서 채우므로 지금은 빈 배열로 둔다.

- [ ] **Step 1: 실패하는 테스트 작성**

`tests/layout.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { buildLayout } from '../src/core/layout';
import type { Dimensions } from '../src/core/dimensions';

const travel: Dimensions = { widthMm: 270, depthMm: 100, heightMm: 140 };

describe('buildLayout — 골든 케이스 (영상 예시 270/100/140)', () => {
  const layout = buildLayout(travel);

  it('전체 크기가 430 x 490mm이다', () => {
    expect(layout.totalWidthMm).toBe(430);
    expect(layout.totalHeightMm).toBe(490);
  });

  it('좌우 들여쓰기가 70mm이다', () => {
    expect(layout.sideInsetMm).toBe(70);
  });

  it('밴드가 위에서 아래 순서로 5개다', () => {
    expect(layout.bands.map((b) => b.id)).toEqual(['topFront', 'front', 'bottom', 'back', 'topBack']);
  });

  it('각 밴드의 크기가 영상 계산과 일치한다', () => {
    const byId = Object.fromEntries(layout.bands.map((b) => [b.id, b]));
    expect(byId.topFront).toMatchObject({ xMm: 0, yMm: 0, widthMm: 430, heightMm: 65 });
    expect(byId.front).toMatchObject({ xMm: 70, yMm: 65, widthMm: 290, heightMm: 120 });
    expect(byId.bottom).toMatchObject({ xMm: 0, yMm: 185, widthMm: 430, heightMm: 120 });
    expect(byId.back).toMatchObject({ xMm: 70, yMm: 305, widthMm: 290, heightMm: 120 });
    expect(byId.topBack).toMatchObject({ xMm: 0, yMm: 425, widthMm: 430, heightMm: 65 });
  });

  it('밴드에 한국어 이름이 붙어 있다', () => {
    const labels = layout.bands.map((b) => b.label);
    expect(labels).toEqual(['지퍼단', '앞판', '바닥', '뒤판', '지퍼단']);
  });
});

describe('buildLayout — 불변식', () => {
  const cases: Dimensions[] = [
    { widthMm: 100, depthMm: 40, heightMm: 60 },
    { widthMm: 400, depthMm: 200, heightMm: 300 },
    { widthMm: 235, depthMm: 95, heightMm: 177 },
    { widthMm: 200, depthMm: 60, heightMm: 60 },
  ];

  it('밴드 높이의 합이 전체 높이와 같다', () => {
    for (const dims of cases) {
      const layout = buildLayout(dims);
      const sum = layout.bands.reduce((acc, b) => acc + b.heightMm, 0);
      expect(sum).toBeCloseTo(layout.totalHeightMm, 10);
    }
  });

  it('밴드가 세로로 빈틈없이 이어진다', () => {
    for (const dims of cases) {
      const layout = buildLayout(dims);
      let expectedY = 0;
      for (const band of layout.bands) {
        expect(band.yMm).toBeCloseTo(expectedY, 10);
        expectedY += band.heightMm;
      }
      expect(expectedY).toBeCloseTo(layout.totalHeightMm, 10);
    }
  });

  it('모든 밴드가 전개도 폭 안에 들어간다', () => {
    for (const dims of cases) {
      const layout = buildLayout(dims);
      for (const band of layout.bands) {
        expect(band.xMm).toBeGreaterThanOrEqual(0);
        expect(band.xMm + band.widthMm).toBeLessThanOrEqual(layout.totalWidthMm + 1e-9);
      }
    }
  });

  it('세로가 홀수여도 반올림하지 않는다', () => {
    const layout = buildLayout({ widthMm: 200, depthMm: 95, heightMm: 140 });
    const topFront = layout.bands[0];
    // 95/2 - 10/2 + 20 = 47.5 - 5 + 20 = 62.5
    expect(topFront?.heightMm).toBe(62.5);
  });
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `npm test`
Expected: FAIL — `Failed to resolve import "../src/core/layout"`

- [ ] **Step 3: layout.ts 작성**

```ts
import { SEAM_MM, ZIPPER_ALLOWANCE_MM } from './constants';
import type { Dimensions } from './dimensions';

export type BandId = 'topFront' | 'front' | 'bottom' | 'back' | 'topBack';

export interface Band {
  readonly id: BandId;
  readonly label: string;
  readonly xMm: number;
  readonly yMm: number;
  readonly widthMm: number;
  readonly heightMm: number;
}

export interface Point {
  readonly xMm: number;
  readonly yMm: number;
}

export interface Line {
  readonly x1Mm: number;
  readonly y1Mm: number;
  readonly x2Mm: number;
  readonly y2Mm: number;
}

export interface Layout {
  readonly dimensions: Dimensions;
  readonly totalWidthMm: number;
  readonly totalHeightMm: number;
  /** 앞판·뒤판이 좌우로 들어가는 양 (mm). 이 부분이 접혀 옆면이 된다. */
  readonly sideInsetMm: number;
  readonly bands: readonly Band[];
  readonly outlineMm: readonly Point[];
  readonly foldLinesMm: readonly Line[];
}

export function buildLayout(dimensions: Dimensions): Layout {
  const { widthMm: W, depthMm: D, heightMm: H } = dimensions;
  const S = SEAM_MM;
  const Z = ZIPPER_ALLOWANCE_MM;

  const totalWidthMm = W + H + 2 * S;
  const panelWidthMm = W + 2 * S;
  const sideInsetMm = H / 2;

  const topBandHeightMm = D / 2 - Z / 2 + 2 * S;
  const panelHeightMm = H - 2 * S;
  const bottomBandHeightMm = D + 2 * S;

  const specs: readonly { id: BandId; label: string; widthMm: number; heightMm: number }[] = [
    { id: 'topFront', label: '지퍼단', widthMm: totalWidthMm, heightMm: topBandHeightMm },
    { id: 'front', label: '앞판', widthMm: panelWidthMm, heightMm: panelHeightMm },
    { id: 'bottom', label: '바닥', widthMm: totalWidthMm, heightMm: bottomBandHeightMm },
    { id: 'back', label: '뒤판', widthMm: panelWidthMm, heightMm: panelHeightMm },
    { id: 'topBack', label: '지퍼단', widthMm: totalWidthMm, heightMm: topBandHeightMm },
  ];

  const bands: Band[] = [];
  let y = 0;
  for (const spec of specs) {
    bands.push({
      id: spec.id,
      label: spec.label,
      xMm: (totalWidthMm - spec.widthMm) / 2,
      yMm: y,
      widthMm: spec.widthMm,
      heightMm: spec.heightMm,
    });
    y += spec.heightMm;
  }

  return {
    dimensions,
    totalWidthMm,
    totalHeightMm: y,
    sideInsetMm,
    bands,
    outlineMm: [],
    foldLinesMm: [],
  };
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npm test`
Expected: PASS — 전체 통과. 특히 `totalHeightMm`이 밴드 합(490)으로 계산되어 `2D + 2H − Z + 2S`와 일치한다.

- [ ] **Step 5: 커밋**

```bash
git add -A
git commit -m "전개도 5밴드 계산 추가"
```

---

## Task 3: 외곽선과 접힘선

**Files:**
- Modify: `src/core/layout.ts` (`buildLayout`의 `outlineMm`, `foldLinesMm` 채우기)
- Modify: `tests/layout.test.ts` (테스트 추가)

**Interfaces:**
- Consumes: Task 2의 `Layout`, `Band`, `Point`, `Line`
- Produces: 채워진 `Layout.outlineMm` (시계 방향 폴리곤 꼭짓점), `Layout.foldLinesMm` (수직 접힘선 2개)

- [ ] **Step 1: 실패하는 테스트 작성**

`tests/layout.test.ts` 끝에 아래를 추가한다:

```ts
describe('buildLayout — 외곽선과 접힘선', () => {
  const layout = buildLayout(travel);

  it('외곽선이 20각형이다', () => {
    // 좌우 각각 앞판 홈 5점 + 뒤판 홈 5점 = 10점, 대칭으로 총 20점
    expect(layout.outlineMm).toHaveLength(20);
  });

  it('외곽선이 닫힌 도형이며 전체 크기에 딱 맞는다', () => {
    const xs = layout.outlineMm.map((p) => p.xMm);
    const ys = layout.outlineMm.map((p) => p.yMm);
    expect(Math.min(...xs)).toBe(0);
    expect(Math.max(...xs)).toBe(layout.totalWidthMm);
    expect(Math.min(...ys)).toBe(0);
    expect(Math.max(...ys)).toBe(layout.totalHeightMm);
  });

  it('외곽선의 이웃 꼭짓점은 항상 수평 또는 수직으로 이어진다', () => {
    const pts = layout.outlineMm;
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i]!;
      const b = pts[(i + 1) % pts.length]!;
      const sameX = Math.abs(a.xMm - b.xMm) < 1e-9;
      const sameY = Math.abs(a.yMm - b.yMm) < 1e-9;
      expect(sameX || sameY).toBe(true);
    }
  });

  it('오목한 부분이 앞판·뒤판 좌우에 생긴다', () => {
    // 앞판 왼쪽 위 모서리 (70, 65) 가 외곽선 꼭짓점이어야 한다
    const hasCorner = layout.outlineMm.some(
      (p) => Math.abs(p.xMm - 70) < 1e-9 && Math.abs(p.yMm - 65) < 1e-9,
    );
    expect(hasCorner).toBe(true);
  });

  it('접힘선이 좌우 2개이며 전체 높이를 관통한다', () => {
    expect(layout.foldLinesMm).toHaveLength(2);
    for (const line of layout.foldLinesMm) {
      expect(line.x1Mm).toBe(line.x2Mm);
      expect(line.y1Mm).toBe(0);
      expect(line.y2Mm).toBe(layout.totalHeightMm);
    }
    expect(layout.foldLinesMm.map((l) => l.x1Mm)).toEqual([70, 360]);
  });
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `npm test`
Expected: FAIL — `expected [] to have a length of 12 but got 0`

- [ ] **Step 3: 외곽선·접힘선 계산 구현**

`src/core/layout.ts`의 `buildLayout` 안, `return` 직전에 아래를 추가한다.

전개도는 위·가운데·아래 세 밴드가 전체 폭이고 그 사이의 앞판·뒤판이 좁으므로, 좌우에 각각 사각 홈이 두 개씩 파인다. 홈 하나가 꼭짓점 4개를 추가하므로 사각형의 4점 + 홈 4개 × 4점 = **20각형**이 된다.

```ts
  const left = sideInsetMm;
  const right = totalWidthMm - sideInsetMm;
  const topBandBottom = topBandHeightMm;
  const frontBottom = topBandBottom + panelHeightMm;
  const bottomBandBottom = frontBottom + bottomBandHeightMm;
  const backBottom = bottomBandBottom + panelHeightMm;
  const total = y;

  // 좌상단에서 시계 방향으로 한 바퀴.
  // 오른쪽 변을 내려가며 앞판 홈 → 뒤판 홈, 왼쪽 변을 올라오며 뒤판 홈 → 앞판 홈.
  const outlineMm: Point[] = [
    { xMm: 0, yMm: 0 },
    { xMm: totalWidthMm, yMm: 0 },
    // 오른쪽 — 앞판 홈
    { xMm: totalWidthMm, yMm: topBandBottom },
    { xMm: right, yMm: topBandBottom },
    { xMm: right, yMm: frontBottom },
    { xMm: totalWidthMm, yMm: frontBottom },
    // 오른쪽 — 뒤판 홈
    { xMm: totalWidthMm, yMm: bottomBandBottom },
    { xMm: right, yMm: bottomBandBottom },
    { xMm: right, yMm: backBottom },
    { xMm: totalWidthMm, yMm: backBottom },
    { xMm: totalWidthMm, yMm: total },
    { xMm: 0, yMm: total },
    // 왼쪽 — 뒤판 홈
    { xMm: 0, yMm: backBottom },
    { xMm: left, yMm: backBottom },
    { xMm: left, yMm: bottomBandBottom },
    { xMm: 0, yMm: bottomBandBottom },
    // 왼쪽 — 앞판 홈
    { xMm: 0, yMm: frontBottom },
    { xMm: left, yMm: frontBottom },
    { xMm: left, yMm: topBandBottom },
    { xMm: 0, yMm: topBandBottom },
  ];

  const foldLinesMm: Line[] = [
    { x1Mm: left, y1Mm: 0, x2Mm: left, y2Mm: total },
    { x1Mm: right, y1Mm: 0, x2Mm: right, y2Mm: total },
  ];
```

그리고 `return` 문의 `outlineMm: []`, `foldLinesMm: []`를 `outlineMm`, `foldLinesMm`로 교체한다.

- [ ] **Step 4: 테스트 통과 확인**

Run: `npm test`
Expected: PASS — 외곽선 20각형, 모든 변이 수평/수직, 접힘선 x=70·360

- [ ] **Step 5: 커밋**

```bash
git add -A
git commit -m "전개도 외곽선과 옆면 접힘선 계산 추가"
```

---

## Task 4: 페이지 분할

**Files:**
- Create: `src/core/tiling.ts`
- Test: `tests/tiling.test.ts`

**Interfaces:**
- Consumes: `Layout` (Task 2·3)
- Produces:
  - `type PaperSize = 'a4' | 'a3'`, `type Orientation = 'portrait' | 'landscape'`
  - `PAPER_MM: Record<PaperSize, { widthMm: number; heightMm: number }>`
  - `PAGE_MARGIN_MM: number` (8), `PAGE_OVERLAP_MM: number` (10)
  - `interface Page { row: number; col: number; gridLabel: string; originXMm: number; originYMm: number }`
  - `interface Pagination { paper: PaperSize; orientation: Orientation; pageWidthMm: number; pageHeightMm: number; contentWidthMm: number; contentHeightMm: number; rows: number; cols: number; pages: Page[] }`
  - `paginate(layout: Layout, paper: PaperSize): Pagination`

`originXMm`/`originYMm`는 해당 페이지의 인쇄 영역 좌상단이 전개도 좌표계의 어디에 놓이는지를 뜻한다.

- [ ] **Step 1: 실패하는 테스트 작성**

`tests/tiling.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { buildLayout } from '../src/core/layout';
import { PAGE_MARGIN_MM, PAGE_OVERLAP_MM, PAPER_MM, paginate } from '../src/core/tiling';
import type { Dimensions } from '../src/core/dimensions';

const travel: Dimensions = { widthMm: 270, depthMm: 100, heightMm: 140 };
const layout = buildLayout(travel);

describe('paginate', () => {
  it('전개도 전체를 덮는다', () => {
    for (const paper of ['a4', 'a3'] as const) {
      const p = paginate(layout, paper);
      const lastCol = Math.max(...p.pages.map((pg) => pg.originXMm + p.contentWidthMm));
      const lastRow = Math.max(...p.pages.map((pg) => pg.originYMm + p.contentHeightMm));
      expect(lastCol).toBeGreaterThanOrEqual(layout.totalWidthMm);
      expect(lastRow).toBeGreaterThanOrEqual(layout.totalHeightMm);
    }
  });

  it('첫 페이지는 원점에서 시작한다', () => {
    const p = paginate(layout, 'a4');
    expect(p.pages[0]).toMatchObject({ row: 0, col: 0, originXMm: 0, originYMm: 0 });
  });

  it('이웃 페이지가 겹침 폭만큼 겹친다', () => {
    const p = paginate(layout, 'a4');
    const step = p.contentWidthMm - PAGE_OVERLAP_MM;
    const secondInRow = p.pages.find((pg) => pg.row === 0 && pg.col === 1);
    if (secondInRow) expect(secondInRow.originXMm).toBeCloseTo(step, 10);
  });

  it('인쇄 영역이 용지에서 여백을 뺀 크기다', () => {
    const p = paginate(layout, 'a4');
    expect(p.contentWidthMm).toBeCloseTo(p.pageWidthMm - 2 * PAGE_MARGIN_MM, 10);
    expect(p.contentHeightMm).toBeCloseTo(p.pageHeightMm - 2 * PAGE_MARGIN_MM, 10);
  });

  it('페이지 수가 행 x 열과 같고 격자 라벨이 붙는다', () => {
    const p = paginate(layout, 'a4');
    expect(p.pages).toHaveLength(p.rows * p.cols);
    expect(p.pages[0]?.gridLabel).toBe('A1');
    const second = p.pages.find((pg) => pg.row === 0 && pg.col === 1);
    if (second) expect(second.gridLabel).toBe('A2');
    const nextRow = p.pages.find((pg) => pg.row === 1 && pg.col === 0);
    if (nextRow) expect(nextRow.gridLabel).toBe('B1');
  });

  it('A3가 A4보다 장수가 적거나 같다', () => {
    expect(paginate(layout, 'a3').pages.length).toBeLessThanOrEqual(
      paginate(layout, 'a4').pages.length,
    );
  });

  it('장수가 적은 용지 방향을 고른다', () => {
    const p = paginate(layout, 'a4');
    const { widthMm, heightMm } = PAPER_MM.a4;
    const countFor = (pw: number, ph: number) => {
      const cw = pw - 2 * PAGE_MARGIN_MM;
      const ch = ph - 2 * PAGE_MARGIN_MM;
      const cols = Math.max(1, Math.ceil((layout.totalWidthMm - PAGE_OVERLAP_MM) / (cw - PAGE_OVERLAP_MM)));
      const rows = Math.max(1, Math.ceil((layout.totalHeightMm - PAGE_OVERLAP_MM) / (ch - PAGE_OVERLAP_MM)));
      return rows * cols;
    };
    const best = Math.min(countFor(widthMm, heightMm), countFor(heightMm, widthMm));
    expect(p.pages.length).toBe(best);
  });

  it('전개도가 한 장에 들어가면 1장만 만든다', () => {
    const tiny = buildLayout({ widthMm: 100, depthMm: 40, heightMm: 60 });
    const p = paginate(tiny, 'a3');
    expect(p.pages).toHaveLength(1);
    expect(p.rows).toBe(1);
    expect(p.cols).toBe(1);
  });
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `npm test`
Expected: FAIL — `Failed to resolve import "../src/core/tiling"`

- [ ] **Step 3: tiling.ts 작성**

```ts
import type { Layout } from './layout';

export type PaperSize = 'a4' | 'a3';
export type Orientation = 'portrait' | 'landscape';

export const PAPER_MM: Record<PaperSize, { widthMm: number; heightMm: number }> = {
  a4: { widthMm: 210, heightMm: 297 },
  a3: { widthMm: 297, heightMm: 420 },
};

/** 프린터 비인쇄 영역을 감안한 사방 여백 (mm) */
export const PAGE_MARGIN_MM = 8;

/** 이웃 페이지끼리 겹치는 폭 (mm). 잘라 붙일 여유. */
export const PAGE_OVERLAP_MM = 10;

export interface Page {
  readonly row: number;
  readonly col: number;
  readonly gridLabel: string;
  readonly originXMm: number;
  readonly originYMm: number;
}

export interface Pagination {
  readonly paper: PaperSize;
  readonly orientation: Orientation;
  readonly pageWidthMm: number;
  readonly pageHeightMm: number;
  readonly contentWidthMm: number;
  readonly contentHeightMm: number;
  readonly rows: number;
  readonly cols: number;
  readonly pages: readonly Page[];
}

function countTiles(totalMm: number, contentMm: number): number {
  const step = contentMm - PAGE_OVERLAP_MM;
  if (step <= 0) throw new Error('용지가 겹침 폭보다 작습니다.');
  if (totalMm <= contentMm) return 1;
  return Math.ceil((totalMm - PAGE_OVERLAP_MM) / step);
}

function gridLabel(row: number, col: number): string {
  return `${String.fromCharCode(65 + row)}${col + 1}`;
}

export function paginate(layout: Layout, paper: PaperSize): Pagination {
  const spec = PAPER_MM[paper];

  const candidates: readonly { orientation: Orientation; pageWidthMm: number; pageHeightMm: number }[] = [
    { orientation: 'portrait', pageWidthMm: spec.widthMm, pageHeightMm: spec.heightMm },
    { orientation: 'landscape', pageWidthMm: spec.heightMm, pageHeightMm: spec.widthMm },
  ];

  let best: Pagination | null = null;

  for (const candidate of candidates) {
    const contentWidthMm = candidate.pageWidthMm - 2 * PAGE_MARGIN_MM;
    const contentHeightMm = candidate.pageHeightMm - 2 * PAGE_MARGIN_MM;
    const cols = countTiles(layout.totalWidthMm, contentWidthMm);
    const rows = countTiles(layout.totalHeightMm, contentHeightMm);

    if (best !== null && rows * cols >= best.rows * best.cols) continue;

    const pages: Page[] = [];
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        pages.push({
          row,
          col,
          gridLabel: gridLabel(row, col),
          originXMm: col * (contentWidthMm - PAGE_OVERLAP_MM),
          originYMm: row * (contentHeightMm - PAGE_OVERLAP_MM),
        });
      }
    }

    best = {
      paper,
      orientation: candidate.orientation,
      pageWidthMm: candidate.pageWidthMm,
      pageHeightMm: candidate.pageHeightMm,
      contentWidthMm,
      contentHeightMm,
      rows,
      cols,
      pages,
    };
  }

  if (best === null) throw new Error('페이지를 계산하지 못했습니다.');
  return best;
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npm test`
Expected: PASS — 8개 테스트 통과

- [ ] **Step 5: 커밋**

```bash
git add -A
git commit -m "용지 방향 자동 선택과 겹침 타일링 계산 추가"
```

---

## Task 5: PDF 생성

**Files:**
- Create: `src/core/pdf.ts`
- Test: `tests/pdf.test.ts`

**Interfaces:**
- Consumes: `Layout` (Task 2·3), `Pagination`, `PAGE_MARGIN_MM`, `PAGE_OVERLAP_MM` (Task 4)
- Produces:
  - `MM_TO_PT: number`
  - `RULER_LENGTH_MM: number` (50)
  - `buildPdf(layout: Layout, pagination: Pagination): Promise<Uint8Array>`

- [ ] **Step 1: 실패하는 테스트 작성**

`tests/pdf.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { buildLayout } from '../src/core/layout';
import { paginate } from '../src/core/tiling';
import { MM_TO_PT, buildPdf } from '../src/core/pdf';
import type { Dimensions } from '../src/core/dimensions';

const travel: Dimensions = { widthMm: 270, depthMm: 100, heightMm: 140 };
const layout = buildLayout(travel);

describe('buildPdf', () => {
  it('PDF 헤더로 시작하는 바이트를 만든다', async () => {
    const bytes = await buildPdf(layout, paginate(layout, 'a4'));
    const head = new TextDecoder().decode(bytes.slice(0, 5));
    expect(head).toBe('%PDF-');
  });

  it('페이지 수가 타일링 결과 + 안내 1장과 일치한다', async () => {
    const pagination = paginate(layout, 'a4');
    const bytes = await buildPdf(layout, pagination);
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBe(pagination.pages.length + 1);
  });

  it('페이지 크기가 지정한 용지와 일치한다', async () => {
    const pagination = paginate(layout, 'a4');
    const bytes = await buildPdf(layout, pagination);
    const doc = await PDFDocument.load(bytes);
    for (const page of doc.getPages()) {
      expect(page.getWidth()).toBeCloseTo(pagination.pageWidthMm * MM_TO_PT, 1);
      expect(page.getHeight()).toBeCloseTo(pagination.pageHeightMm * MM_TO_PT, 1);
    }
  });

  it('A3도 같은 규칙으로 만들어진다', async () => {
    const pagination = paginate(layout, 'a3');
    const bytes = await buildPdf(layout, pagination);
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBe(pagination.pages.length + 1);
    expect(doc.getPage(0).getWidth()).toBeCloseTo(pagination.pageWidthMm * MM_TO_PT, 1);
  });
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `npm test`
Expected: FAIL — `Failed to resolve import "../src/core/pdf"`

- [ ] **Step 3: pdf.ts 작성**

PDF 좌표계는 좌하단이 원점이고 y가 위로 증가한다. 전개도 좌표계(좌상단 원점, y 아래)와 반대이므로 변환 함수를 하나 두고 전부 통과시킨다.

```ts
// PDF 안내 문구는 영문만 쓴다. pdf-lib 표준 폰트에 한글 글리프가 없어
// drawText가 "WinAnsi cannot encode" 오류를 던지고, 한글 폰트를 번들하면
// 외부 의존 0 원칙과 산출물 크기에 어긋난다. 한국어 안내는 화면(UI)에서 제공한다.
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import type { Layout, Line, Point } from './layout';
import { PAGE_MARGIN_MM, PAGE_OVERLAP_MM, type Pagination, type Page } from './tiling';

export const MM_TO_PT = 72 / 25.4;

/** 축척 검증용 눈금자 길이 (mm) */
export const RULER_LENGTH_MM = 50;

const CUT_COLOR = rgb(0, 0, 0);
const FOLD_COLOR = rgb(0.55, 0.55, 0.55);
const MARK_COLOR = rgb(0.2, 0.2, 0.2);

interface PageContext {
  readonly pdfPage: PDFPage;
  readonly pagination: Pagination;
  readonly page: Page;
}

/** 전개도 좌표(mm) → PDF 좌표(pt). 페이지 원점과 y축 뒤집기를 함께 처리한다. */
function toPagePoint(ctx: PageContext, xMm: number, yMm: number): { x: number; y: number } {
  const localXMm = xMm - ctx.page.originXMm + PAGE_MARGIN_MM;
  const localYMm = yMm - ctx.page.originYMm + PAGE_MARGIN_MM;
  return {
    x: localXMm * MM_TO_PT,
    y: (ctx.pagination.pageHeightMm - localYMm) * MM_TO_PT,
  };
}

function drawPolygon(ctx: PageContext, points: readonly Point[], thickness: number) {
  for (let i = 0; i < points.length; i++) {
    const a = points[i]!;
    const b = points[(i + 1) % points.length]!;
    ctx.pdfPage.drawLine({
      start: toPagePoint(ctx, a.xMm, a.yMm),
      end: toPagePoint(ctx, b.xMm, b.yMm),
      thickness,
      color: CUT_COLOR,
    });
  }
}

function drawFoldLine(ctx: PageContext, line: Line) {
  ctx.pdfPage.drawLine({
    start: toPagePoint(ctx, line.x1Mm, line.y1Mm),
    end: toPagePoint(ctx, line.x2Mm, line.y2Mm),
    thickness: 0.5,
    color: FOLD_COLOR,
    dashArray: [4, 4],
  });
}

function drawAlignmentMarks(ctx: PageContext, font: PDFFont) {
  const { pagination, page } = ctx;
  const armPt = 4 * MM_TO_PT;
  const corners: readonly { xMm: number; yMm: number }[] = [
    { xMm: PAGE_MARGIN_MM, yMm: PAGE_MARGIN_MM },
    { xMm: pagination.pageWidthMm - PAGE_MARGIN_MM, yMm: PAGE_MARGIN_MM },
    { xMm: PAGE_MARGIN_MM, yMm: pagination.pageHeightMm - PAGE_MARGIN_MM },
    { xMm: pagination.pageWidthMm - PAGE_MARGIN_MM, yMm: pagination.pageHeightMm - PAGE_MARGIN_MM },
  ];

  for (const corner of corners) {
    const x = corner.xMm * MM_TO_PT;
    const y = (pagination.pageHeightMm - corner.yMm) * MM_TO_PT;
    ctx.pdfPage.drawLine({
      start: { x: x - armPt, y },
      end: { x: x + armPt, y },
      thickness: 0.5,
      color: MARK_COLOR,
    });
    ctx.pdfPage.drawLine({
      start: { x, y: y - armPt },
      end: { x, y: y + armPt },
      thickness: 0.5,
      color: MARK_COLOR,
    });
  }

  ctx.pdfPage.drawText(page.gridLabel, {
    x: (PAGE_MARGIN_MM + 2) * MM_TO_PT,
    y: (pagination.pageHeightMm - PAGE_MARGIN_MM - 6) * MM_TO_PT,
    size: 12,
    font,
    color: MARK_COLOR,
  });
}

function drawRuler(ctx: PageContext, font: PDFFont) {
  const { pagination } = ctx;
  const startXMm = PAGE_MARGIN_MM + 4;
  const yMm = pagination.pageHeightMm - PAGE_MARGIN_MM - 4;
  const y = (pagination.pageHeightMm - yMm) * MM_TO_PT;

  ctx.pdfPage.drawLine({
    start: { x: startXMm * MM_TO_PT, y },
    end: { x: (startXMm + RULER_LENGTH_MM) * MM_TO_PT, y },
    thickness: 1,
    color: MARK_COLOR,
  });
  for (const tickXMm of [startXMm, startXMm + RULER_LENGTH_MM]) {
    ctx.pdfPage.drawLine({
      start: { x: tickXMm * MM_TO_PT, y },
      end: { x: tickXMm * MM_TO_PT, y: y + 3 * MM_TO_PT },
      thickness: 1,
      color: MARK_COLOR,
    });
  }
  ctx.pdfPage.drawText(`${RULER_LENGTH_MM}mm`, {
    x: (startXMm + RULER_LENGTH_MM + 3) * MM_TO_PT,
    y: y - 1,
    size: 8,
    font,
    color: MARK_COLOR,
  });
}

function drawGuidePage(
  doc: PDFDocument,
  layout: Layout,
  pagination: Pagination,
  font: PDFFont,
) {
  const page = doc.addPage([
    pagination.pageWidthMm * MM_TO_PT,
    pagination.pageHeightMm * MM_TO_PT,
  ]);
  const { widthMm: W, depthMm: D, heightMm: H } = layout.dimensions;

  const title = 'BOX POUCH PATTERN';
  const lines = [
    title,
    '',
    `Finished  W ${W} x D ${D} x H ${H} mm`,
    `Pattern   ${round1(layout.totalWidthMm)} x ${round1(layout.totalHeightMm)} mm`,
    `Paper     ${pagination.paper.toUpperCase()} ${pagination.orientation} - ${pagination.pages.length} sheets (${pagination.rows} x ${pagination.cols})`,
    '',
    'PRINT AT 100% - do NOT use "fit to page".',
    `Check the ${RULER_LENGTH_MM}mm ruler on each sheet with a real ruler.`,
    '',
    `Overlap ${PAGE_OVERLAP_MM}mm - align the cross marks and tape together.`,
    'A1 is top-left; A2 to the right, B1 below.',
    '',
    'Seam allowance is already included - cut as drawn.',
  ];

  let yMm = PAGE_MARGIN_MM + 12;
  for (const line of lines) {
    page.drawText(line, {
      x: (PAGE_MARGIN_MM + 6) * MM_TO_PT,
      y: (pagination.pageHeightMm - yMm) * MM_TO_PT,
      size: line === title ? 16 : 10,
      font,
      color: CUT_COLOR,
    });
    yMm += line === '' ? 4 : 7;
  }

  // 전체 배치 축소도 — 페이지 격자와 전개도 외곽선
  const availableWidthMm = pagination.pageWidthMm - 2 * (PAGE_MARGIN_MM + 6);
  const scale = availableWidthMm / layout.totalWidthMm;
  const originYMm = yMm + 8;

  for (const tile of pagination.pages) {
    const x = (PAGE_MARGIN_MM + 6 + tile.originXMm * scale) * MM_TO_PT;
    const wMm = Math.min(pagination.contentWidthMm, layout.totalWidthMm - tile.originXMm) * scale;
    const hMm = Math.min(pagination.contentHeightMm, layout.totalHeightMm - tile.originYMm) * scale;
    const yTopMm = originYMm + tile.originYMm * scale;
    page.drawRectangle({
      x,
      y: (pagination.pageHeightMm - yTopMm - hMm) * MM_TO_PT,
      width: wMm * MM_TO_PT,
      height: hMm * MM_TO_PT,
      borderColor: FOLD_COLOR,
      borderWidth: 0.5,
    });
    page.drawText(tile.gridLabel, {
      x: x + 3,
      y: (pagination.pageHeightMm - yTopMm - 5) * MM_TO_PT,
      size: 7,
      font,
      color: MARK_COLOR,
    });
  }

  for (let i = 0; i < layout.outlineMm.length; i++) {
    const a = layout.outlineMm[i]!;
    const b = layout.outlineMm[(i + 1) % layout.outlineMm.length]!;
    page.drawLine({
      start: {
        x: (PAGE_MARGIN_MM + 6 + a.xMm * scale) * MM_TO_PT,
        y: (pagination.pageHeightMm - originYMm - a.yMm * scale) * MM_TO_PT,
      },
      end: {
        x: (PAGE_MARGIN_MM + 6 + b.xMm * scale) * MM_TO_PT,
        y: (pagination.pageHeightMm - originYMm - b.yMm * scale) * MM_TO_PT,
      },
      thickness: 0.8,
      color: CUT_COLOR,
    });
  }
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

export async function buildPdf(layout: Layout, pagination: Pagination): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);

  drawGuidePage(doc, layout, pagination, font);

  for (const page of pagination.pages) {
    const pdfPage = doc.addPage([
      pagination.pageWidthMm * MM_TO_PT,
      pagination.pageHeightMm * MM_TO_PT,
    ]);
    const ctx: PageContext = { pdfPage, pagination, page };

    drawPolygon(ctx, layout.outlineMm, 1);
    for (const line of layout.foldLinesMm) drawFoldLine(ctx, line);
    for (const band of layout.bands) {
      if (band.yMm === 0) continue;
      drawFoldLine(ctx, {
        x1Mm: band.xMm,
        y1Mm: band.yMm,
        x2Mm: band.xMm + band.widthMm,
        y2Mm: band.yMm,
      });
    }

    drawAlignmentMarks(ctx, font);
    drawRuler(ctx, font);
  }

  return doc.save();
}
```

도면 자체에는 글자를 넣지 않으므로 한글 문제가 생기지 않는다. 조각 이름과 치수는 화면(SVG 미리보기)에서 보여준다.

- [ ] **Step 4: 테스트 통과 확인**

Run: `npm test`
Expected: PASS — 4개 테스트 통과. `WinAnsi cannot encode` 오류가 나면 안내 페이지에 한글이 섞인 것이다.

- [ ] **Step 5: 커밋**

```bash
git add -A
git commit -m "1:1 타일링 PDF 생성 추가"
```

---

## Task 6: SVG 미리보기

**Files:**
- Create: `src/ui/preview.ts`
- Test: `tests/preview.test.ts`

**Interfaces:**
- Consumes: `Layout` (Task 2·3), `Pagination` (Task 4)
- Produces: `renderPreviewSvg(layout: Layout, pagination: Pagination): string`

DOM API를 쓰지 않고 SVG **문자열**을 만든다. 테스트가 쉽고 `core`와 같은 방식으로 검증된다.

- [ ] **Step 1: 실패하는 테스트 작성**

`tests/preview.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { buildLayout } from '../src/core/layout';
import { paginate } from '../src/core/tiling';
import { renderPreviewSvg } from '../src/ui/preview';

const layout = buildLayout({ widthMm: 270, depthMm: 100, heightMm: 140 });
const pagination = paginate(layout, 'a4');
const svg = renderPreviewSvg(layout, pagination);

describe('renderPreviewSvg', () => {
  it('전개도 크기에 맞는 viewBox를 쓴다', () => {
    expect(svg).toContain('viewBox="0 0 430 490"');
  });

  it('외곽선을 폴리곤으로 그린다', () => {
    expect(svg).toContain('<polygon');
  });

  it('밴드 이름을 모두 표시한다', () => {
    for (const label of ['지퍼단', '앞판', '바닥', '뒤판']) {
      expect(svg).toContain(label);
    }
  });

  it('전체 치수를 표시한다', () => {
    expect(svg).toContain('430');
    expect(svg).toContain('490');
  });

  it('페이지 분할 경계를 페이지 수만큼 그린다', () => {
    const count = (svg.match(/class="page-tile"/g) ?? []).length;
    expect(count).toBe(pagination.pages.length);
  });

  it('접힘선을 점선으로 그린다', () => {
    expect(svg).toContain('stroke-dasharray');
  });

  it('XML 특수문자를 이스케이프한다', () => {
    expect(svg).not.toMatch(/<text[^>]*>[^<]*[<&][^<]*<\/text>/);
  });
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `npm test`
Expected: FAIL — `Failed to resolve import "../src/ui/preview"`

- [ ] **Step 3: preview.ts 작성**

```ts
import type { Layout } from '../core/layout';
import type { Pagination } from '../core/tiling';

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

export function renderPreviewSvg(layout: Layout, pagination: Pagination): string {
  const w = layout.totalWidthMm;
  const h = layout.totalHeightMm;

  const points = layout.outlineMm.map((p) => `${round1(p.xMm)},${round1(p.yMm)}`).join(' ');

  const tiles = pagination.pages
    .map((page) => {
      const tileW = Math.min(pagination.contentWidthMm, w - page.originXMm);
      const tileH = Math.min(pagination.contentHeightMm, h - page.originYMm);
      return `<rect class="page-tile" x="${round1(page.originXMm)}" y="${round1(page.originYMm)}" width="${round1(tileW)}" height="${round1(tileH)}" fill="none" stroke="#c8d4e8" stroke-width="1" stroke-dasharray="6 4" />`;
    })
    .join('');

  const folds = layout.foldLinesMm
    .map(
      (line) =>
        `<line x1="${round1(line.x1Mm)}" y1="${round1(line.y1Mm)}" x2="${round1(line.x2Mm)}" y2="${round1(line.y2Mm)}" stroke="#888" stroke-width="1" stroke-dasharray="8 5" />`,
    )
    .join('');

  const bandLines = layout.bands
    .filter((band) => band.yMm > 0)
    .map(
      (band) =>
        `<line x1="${round1(band.xMm)}" y1="${round1(band.yMm)}" x2="${round1(band.xMm + band.widthMm)}" y2="${round1(band.yMm)}" stroke="#888" stroke-width="1" stroke-dasharray="8 5" />`,
    )
    .join('');

  const labels = layout.bands
    .map(
      (band) =>
        `<text x="${round1(band.xMm + band.widthMm / 2)}" y="${round1(band.yMm + band.heightMm / 2)}" text-anchor="middle" dominant-baseline="middle" font-size="14" fill="#333">${escapeXml(band.label)}</text>`,
    )
    .join('');

  const dims =
    `<text x="${round1(w / 2)}" y="-8" text-anchor="middle" font-size="14" fill="#555">${round1(w)}mm</text>` +
    `<text x="-8" y="${round1(h / 2)}" text-anchor="middle" font-size="14" fill="#555" transform="rotate(-90 -8 ${round1(h / 2)})">${round1(h)}mm</text>`;

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${round1(w)} ${round1(h)}"`,
    ` style="overflow: visible; max-width: 100%; height: auto;" role="img"`,
    ` aria-label="${escapeXml(`가로 ${round1(w)}mm, 세로 ${round1(h)}mm 전개도 미리보기`)}">`,
    `<g transform="translate(0,0)">`,
    tiles,
    `<polygon points="${points}" fill="#fffdf5" stroke="#222" stroke-width="2" />`,
    bandLines,
    folds,
    labels,
    dims,
    `</g>`,
    `</svg>`,
  ].join('');
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npm test`
Expected: PASS — 7개 테스트 통과

- [ ] **Step 5: 커밋**

```bash
git add -A
git commit -m "SVG 전개도 미리보기 추가"
```

---

## Task 7: 화면 조립

**Files:**
- Create: `index.html`, `src/main.ts`, `src/ui/form.ts`, `src/style.css`
- Test: 없음 (DOM 배선 코드. 검증은 Task 8의 수동 확인 절차로 한다)

**Interfaces:**
- Consumes: `PRESETS`, `RANGES`, `FIELD_LABELS` (Task 1), `validateDimensions` (Task 1), `buildLayout` (Task 2·3), `paginate` (Task 4), `buildPdf` (Task 5), `renderPreviewSvg` (Task 6)
- Produces: 동작하는 화면

- [ ] **Step 1: index.html 작성**

```html
<!doctype html>
<html lang="ko">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>사각 파우치 도안 만들기</title>
  </head>
  <body>
    <main class="page">
      <header class="head">
        <h1>사각 파우치 도안 만들기</h1>
        <p class="sub">완성 치수를 넣으면 시접까지 포함된 도안 PDF가 나옵니다.</p>
      </header>

      <section class="card">
        <h2 class="label">자주 쓰는 크기</h2>
        <div class="presets" id="presets"></div>

        <h2 class="label">완성 치수 (mm)</h2>
        <div class="inputs" id="inputs"></div>
        <p class="error" id="error" hidden></p>

        <h2 class="label">미리보기</h2>
        <div class="preview" id="preview"></div>
        <p class="note">
          점선은 접히는 자리이고, 옅은 사각형은 인쇄 페이지 경계입니다.
          시접 10mm가 이미 포함되어 있어 그대로 재단하면 됩니다.
        </p>

        <h2 class="label">용지</h2>
        <div class="papers" id="papers"></div>

        <button type="button" id="download" class="download">패턴 PDF 다운로드</button>
      </section>
    </main>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
```

- [ ] **Step 2: form.ts 작성**

```ts
import { FIELD_LABELS, PRESETS, RANGES, type DimensionField, type Preset } from '../core/constants';
import type { PaperSize } from '../core/tiling';

const FIELDS: readonly DimensionField[] = ['widthMm', 'depthMm', 'heightMm'];

export function renderPresetButtons(container: HTMLElement, onPick: (preset: Preset) => void): void {
  container.innerHTML = '';
  for (const preset of PRESETS) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'preset';
    button.textContent = `${preset.label} ${preset.widthMm}×${preset.depthMm}×${preset.heightMm}`;
    button.addEventListener('click', () => onPick(preset));
    container.append(button);
  }
}

export function renderInputs(container: HTMLElement, onChange: () => void): void {
  container.innerHTML = '';
  for (const field of FIELDS) {
    const { min, max } = RANGES[field];
    const wrapper = document.createElement('label');
    wrapper.className = 'input-row';

    const name = document.createElement('span');
    name.className = 'input-name';
    name.textContent = FIELD_LABELS[field];

    const input = document.createElement('input');
    input.type = 'number';
    input.id = `field-${field}`;
    input.min = String(min);
    input.max = String(max);
    input.step = '1';
    input.inputMode = 'numeric';
    input.addEventListener('input', onChange);

    const hint = document.createElement('span');
    hint.className = 'input-hint';
    hint.textContent = `${min}~${max}mm`;

    wrapper.append(name, input, hint);
    container.append(wrapper);
  }
}

export function renderPaperOptions(
  container: HTMLElement,
  selected: PaperSize,
  onChange: (paper: PaperSize) => void,
): void {
  container.innerHTML = '';
  for (const paper of ['a4', 'a3'] as const) {
    const label = document.createElement('label');
    label.className = 'paper-option';

    const radio = document.createElement('input');
    radio.type = 'radio';
    radio.name = 'paper';
    radio.value = paper;
    radio.checked = paper === selected;
    radio.addEventListener('change', () => onChange(paper));

    const text = document.createElement('span');
    text.textContent = paper.toUpperCase();

    const count = document.createElement('span');
    count.className = 'paper-count';
    count.id = `paper-count-${paper}`;

    label.append(radio, text, count);
    container.append(label);
  }
}

export function readInputs(): Record<DimensionField, unknown> {
  const values = {} as Record<DimensionField, unknown>;
  for (const field of FIELDS) {
    const input = document.getElementById(`field-${field}`) as HTMLInputElement | null;
    values[field] = input?.value ?? '';
  }
  return values;
}

export function writeInputs(preset: Preset): void {
  for (const field of FIELDS) {
    const input = document.getElementById(`field-${field}`) as HTMLInputElement | null;
    if (input) input.value = String(preset[field]);
  }
}

export function setPaperCount(paper: PaperSize, sheets: number | null): void {
  const el = document.getElementById(`paper-count-${paper}`);
  if (el) el.textContent = sheets === null ? '' : ` · ${sheets}장`;
}
```

- [ ] **Step 3: main.ts 작성**

```ts
import { PRESETS, type Preset } from './core/constants';
import { validateDimensions } from './core/dimensions';
import { buildLayout } from './core/layout';
import { buildPdf } from './core/pdf';
import { paginate, type PaperSize } from './core/tiling';
import {
  readInputs,
  renderInputs,
  renderPaperOptions,
  renderPresetButtons,
  setPaperCount,
  writeInputs,
} from './ui/form';
import { renderPreviewSvg } from './ui/preview';
import './style.css';

const PAGE_WARN_THRESHOLD = 20;

const presetsEl = document.getElementById('presets')!;
const inputsEl = document.getElementById('inputs')!;
const papersEl = document.getElementById('papers')!;
const previewEl = document.getElementById('preview')!;
const errorEl = document.getElementById('error')!;
const downloadBtn = document.getElementById('download') as HTMLButtonElement;

let paper: PaperSize = 'a4';

function showError(messages: readonly string[]): void {
  if (messages.length === 0) {
    errorEl.hidden = true;
    errorEl.textContent = '';
    return;
  }
  errorEl.hidden = false;
  errorEl.textContent = messages.join(' ');
}

function refresh(): void {
  const result = validateDimensions(readInputs());

  if (!result.ok) {
    showError(result.errors.map((e) => e.message));
    previewEl.innerHTML = '';
    downloadBtn.disabled = true;
    setPaperCount('a4', null);
    setPaperCount('a3', null);
    return;
  }

  showError([]);
  const layout = buildLayout(result.value);
  const pagination = paginate(layout, paper);
  previewEl.innerHTML = renderPreviewSvg(layout, pagination);
  downloadBtn.disabled = false;

  setPaperCount('a4', paginate(layout, 'a4').pages.length);
  setPaperCount('a3', paginate(layout, 'a3').pages.length);
}

async function download(): Promise<void> {
  const result = validateDimensions(readInputs());
  if (!result.ok) return;

  const layout = buildLayout(result.value);
  const pagination = paginate(layout, paper);

  if (pagination.pages.length > PAGE_WARN_THRESHOLD) {
    const ok = window.confirm(
      `${pagination.pages.length}장이 출력됩니다. 계속할까요?`,
    );
    if (!ok) return;
  }

  downloadBtn.disabled = true;
  try {
    const bytes = await buildPdf(layout, pagination);
    const blob = new Blob([bytes], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const { widthMm: W, depthMm: D, heightMm: H } = result.value;
    link.href = url;
    link.download = `box-pouch-${W}x${D}x${H}-${paper}.pdf`;
    link.click();
    URL.revokeObjectURL(url);
  } catch (error) {
    showError([`PDF를 만들지 못했습니다: ${error instanceof Error ? error.message : String(error)}`]);
  } finally {
    downloadBtn.disabled = false;
  }
}

renderPresetButtons(presetsEl, (preset: Preset) => {
  writeInputs(preset);
  refresh();
});
renderInputs(inputsEl, refresh);
renderPaperOptions(papersEl, paper, (next) => {
  paper = next;
  refresh();
});
downloadBtn.addEventListener('click', () => void download());

writeInputs(PRESETS[2]!);
refresh();
```

- [ ] **Step 4: style.css 작성**

```css
:root {
  --line: #e2e4ea;
  --text: #222;
  --muted: #666;
  --accent: #2f6fed;
  color-scheme: light;
}

* { box-sizing: border-box; }

body {
  margin: 0;
  font-family: -apple-system, BlinkMacSystemFont, 'Apple SD Gothic Neo', 'Segoe UI', sans-serif;
  color: var(--text);
  background: #f6f7f9;
}

.page { max-width: 720px; margin: 0 auto; padding: 24px 16px 64px; }
.head h1 { font-size: 24px; margin: 0 0 4px; }
.sub { margin: 0 0 20px; color: var(--muted); font-size: 14px; }

.card {
  background: #fff;
  border: 1px solid var(--line);
  border-radius: 12px;
  padding: 20px;
}

.label { font-size: 14px; margin: 20px 0 8px; }
.label:first-child { margin-top: 0; }

.presets { display: flex; flex-wrap: wrap; gap: 8px; }
.preset {
  border: 1px solid var(--line);
  background: #fff;
  border-radius: 999px;
  padding: 8px 14px;
  font-size: 13px;
  cursor: pointer;
}
.preset:hover { border-color: var(--accent); color: var(--accent); }

.inputs { display: grid; gap: 10px; }
.input-row { display: grid; grid-template-columns: 110px 1fr 80px; gap: 10px; align-items: center; }
.input-name { font-size: 14px; }
.input-row input {
  border: 1px solid var(--line);
  border-radius: 8px;
  padding: 10px;
  font-size: 15px;
  width: 100%;
}
.input-hint { font-size: 12px; color: var(--muted); }

.error { color: #c0392b; font-size: 13px; margin: 10px 0 0; }

.preview {
  border: 1px solid var(--line);
  border-radius: 10px;
  padding: 28px;
  display: flex;
  justify-content: center;
  background: #fafbfc;
  min-height: 200px;
}
.preview svg { max-width: 100%; height: auto; }

.note { font-size: 12px; color: var(--muted); line-height: 1.6; margin: 8px 0 0; }

.papers { display: flex; gap: 16px; }
.paper-option { display: flex; align-items: center; gap: 6px; font-size: 14px; cursor: pointer; }
.paper-count { color: var(--muted); font-size: 13px; }

.download {
  margin-top: 24px;
  width: 100%;
  border: 0;
  border-radius: 10px;
  background: var(--accent);
  color: #fff;
  padding: 14px;
  font-size: 16px;
  cursor: pointer;
}
.download:disabled { background: #b9c2d4; cursor: not-allowed; }
```

- [ ] **Step 5: 개발 서버로 확인**

Run: `npm run dev`

브라우저에서 확인할 것:
1. 여행 파우치(270×100×140)가 기본으로 채워져 있고 미리보기가 보인다
2. 프리셋 버튼을 누르면 값과 미리보기가 바뀐다
3. 높이를 `10`으로 바꾸면 오류 메시지가 뜨고 다운로드 버튼이 잠긴다
4. A4/A3 옆에 예상 장수가 표시되고, 바꾸면 미리보기의 페이지 경계가 바뀐다
5. 다운로드 버튼을 누르면 PDF가 받아지고, 열어서 눈금자와 격자 라벨이 보인다

- [ ] **Step 6: 커밋**

```bash
git add -A
git commit -m "입력 폼과 미리보기를 잇는 화면 추가"
```

---

## Task 8: 빌드 검증과 README

**Files:**
- Create: `README.md`
- Test: 빌드 산출물 확인

**Interfaces:**
- Consumes: 전체
- Produces: 배포 가능한 `dist/`

- [ ] **Step 1: 타입 검사와 빌드 실행**

Run: `npm run build`
Expected: 타입 오류 없이 `dist/` 생성

- [ ] **Step 2: 산출물에 외부 참조가 없는지 확인**

macOS 기본 grep(BSD)은 lookahead를 지원하지 않으므로 두 단계로 거른다.

```bash
grep -rhoEi "https?://[^\"' )]*" dist/ | grep -v "www.w3.org" | sort -u || true
```

Expected: 출력 없음. SVG 네임스페이스 `www.w3.org`는 네트워크 요청이 아니므로 제외한다. 그 외 주소가 하나라도 나오면 외부 의존이 섞인 것이므로 원인을 찾아 제거한다.

- [ ] **Step 3: 하위 경로 배포 확인**

```bash
npm run preview
```

`dist/index.html`의 자산 경로가 `./assets/...`로 시작하는지 확인한다:

```bash
grep -o 'src="[^"]*"' dist/index.html
```

Expected: `./assets/`로 시작 (절대 경로 `/assets/`가 아님)

- [ ] **Step 4: README 작성**

아래 내용을 `README.md`로 저장한다 (바깥 4백틱은 이 계획 문서의 표시용이므로 파일에는 넣지 않는다).

````markdown
# 사각 파우치 도안 생성기

완성 치수(가로·세로·높이)를 입력하면 지퍼 사각 파우치의 전개도를 1:1 실치수 PDF로 만들어주는 정적 웹 도구.

## 쓰는 법

```bash
npm install
npm run dev      # 개발 서버
npm test         # 테스트
npm run build    # dist/ 생성
```

`dist/`를 정적 호스팅에 그대로 올리면 된다. 하위 경로(`example.com/pouch/`)에 올려도 동작한다.

## 도안 계산

시접 `S`=10mm, 지퍼 차감 `Z`=10mm 고정. 도안 치수에 시접이 포함되어 있어 그대로 재단한다.

| 밴드 | 폭 | 높이 |
|---|---|---|
| 윗단(지퍼단) | `W + H + 2S` | `D/2 − Z/2 + 2S` |
| 앞판 | `W + 2S` | `H − 2S` |
| 바닥 | `W + H + 2S` | `D + 2S` |
| 뒤판 | `W + 2S` | `H − 2S` |
| 윗단(지퍼단) | `W + H + 2S` | `D/2 − Z/2 + 2S` |

전체 크기는 `W + H + 2S` × `2D + 2H − Z + 2S`. 앞판·뒤판이 좌우로 `H/2`씩 들어가며, 그 부분이 접혀 옆면이 된다.

계산법 출처: 유튜브 "에셀피" 채널, [사각파우치 도안 만들기, 도안계산법](https://youtu.be/7nud1soFF5Y)

## 인쇄

**반드시 배율 100%("실제 크기")로 인쇄한다.** "페이지에 맞춤"을 켜면 치수가 틀어진다. 각 장에 있는 50mm 눈금자를 자로 재서 확인한 뒤 재단할 것.

## 구조

- `src/core/` — 도안 계산·타일링·PDF 생성. DOM을 참조하지 않아 Node에서도 그대로 쓸 수 있다.
- `src/ui/` — SVG 미리보기와 입력 폼.

의존은 `ui → core` 단방향이며, 미리보기와 PDF가 같은 계산 결과를 쓴다.
````

- [ ] **Step 5: 전체 테스트 재확인**

Run: `npm test`
Expected: 전체 PASS

- [ ] **Step 6: 커밋**

```bash
git add -A
git commit -m "README와 빌드 설정 마무리"
```

---

## 완료 조건

- `npm test` 전체 통과
- `npm run build` 타입 오류 없이 성공
- 270×100×140 입력 시 미리보기가 430×490mm 전개도를 보여주고, A4 PDF를 받아 인쇄했을 때 50mm 눈금자가 실측 50mm
- `dist/`를 하위 경로에 올려도 동작
