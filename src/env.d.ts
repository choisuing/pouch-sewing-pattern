// SPDX-License-Identifier: MIT
// Copyright (C) 2026 choisuing

/*
 * 빌드할 때 끼워 넣는 값. VITE_ 접두사가 붙은 것만 클라이언트로 넘어간다.
 * TRACK_URL은 GitHub Actions Secret에서 온다 — .github/workflows/deploy.yml 참고.
 */
interface ImportMetaEnv {
  readonly VITE_TRACK_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
