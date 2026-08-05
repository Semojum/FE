// 환경별 fetch 선택기.
//
// 데스크톱(Tauri) 런타임에서는 webview의 브라우저 fetch 대신 tauri-plugin-http의
// fetch를 사용한다. 요청이 네이티브(Rust) 측에서 나가므로, webview origin
// (윈도우 WebView2: http://tauri.localhost)을 기준으로 한 CORS 제약을 받지 않는다.
// → 브라우저 fetch를 그대로 쓰면 api.semojum.app이 해당 origin을 허용하지 않아
//   preflight가 403으로 막혀 "Failed to fetch"가 발생한다.
//
// 개발/테스트(브라우저로 띄운 렌더러·vitest)에서는 브라우저 fetch를 그대로 쓴다.
// 이때의 CORS는 vite proxy가 처리한다. 배포는 데스크톱 앱 하나뿐이라 이 경로를 타지 않는다.

// Tauri(데스크톱) 런타임 여부. 일반 브라우저/테스트에서는 false. (UseOAuth.ts와 동일 기준)
const isTauri = (): boolean =>
  typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

type FetchFn = (input: string, init?: RequestInit) => Promise<Response>;

let tauriFetchPromise: Promise<FetchFn> | null = null;

// Tauri 환경에서만 플러그인을 동적 import 한다(브라우저·테스트에서 평가되지 않도록).
const loadFetch = (): Promise<FetchFn> => {
  if (!isTauri()) {
    // 전역 fetch를 호출 시점에 해석한다(테스트의 vi.spyOn(globalThis,'fetch') 가 가로채도록).
    return Promise.resolve((input, init) => fetch(input, init));
  }
  if (!tauriFetchPromise) {
    tauriFetchPromise = import('@tauri-apps/plugin-http').then(
      (m) => m.fetch as unknown as FetchFn,
    );
  }
  return tauriFetchPromise;
};

// 표준 fetch와 동일한 시그니처. 환경에 맞는 구현으로 위임한다.
export const httpFetch = async (
  input: string,
  init?: RequestInit,
): Promise<Response> => {
  const fetchFn = await loadFetch();
  return fetchFn(input, init);
};
