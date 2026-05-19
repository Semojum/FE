// 환경 변수 VITE_USE_MOCK_API=false 로 명시적으로 끄지 않으면 mock 사용.
export const USE_MOCK_API =
  (import.meta.env.VITE_USE_MOCK_API ?? 'true') !== 'false';
