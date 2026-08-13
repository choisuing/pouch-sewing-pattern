// vitest 설정을 함께 두므로 'vite'가 아니라 'vitest/config'에서 defineConfig를 가져온다.
// 'vite'의 defineConfig에는 test 필드 타입이 없어 `tsc --noEmit`이 실패한다.
import { defineConfig } from 'vitest/config';

export default defineConfig({
  base: './',
  test: {
    environment: 'node',
  },
});
