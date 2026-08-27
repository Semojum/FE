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

import { getClientOs } from '../utils/clientOs';
import { logDiag } from '../utils/diagLog';

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

// 우리 서버로 가는 요청인지 — 상대 경로(개발 프록시)거나 세모점 API 호스트.
// presigned URL(S3·GCS)에는 손대지 않는다. 서명 검증과 CORS preflight가 걸린다.
const isOwnApi = (input: string): boolean =>
  input.startsWith('/') || /^https?:\/\/[^/]*semojum\.app/.test(input);

// 데스크톱 앱의 요청은 네이티브에서 나가 User-Agent에 OS가 없다. 운영자 콘솔의
// "접속 환경"이 비어 보이지 않도록 우리 서버 요청에만 X-Client-Os를 실어 보낸다
// (명세 2026-08-20 · 값이 없으면 서버가 clientOs를 null로 둔다).
const withClientOs = (input: string, init?: RequestInit): RequestInit => {
  const os = getClientOs();
  if (!os || !isOwnApi(input)) return init ?? {};
  return {
    ...init,
    headers: {
      ...(init?.headers as Record<string, string>),
      'X-Client-Os': os,
    },
  };
};

// 파일을 실어 보내는 요청인지 — FormData·Blob·ArrayBuffer 같은 바이너리 본문.
const hasBinaryBody = (body: BodyInit | null | undefined): boolean =>
  body instanceof FormData ||
  body instanceof Blob ||
  body instanceof ArrayBuffer ||
  ArrayBuffer.isView(body);

// 표준 fetch와 동일한 시그니처. 환경에 맞는 구현으로 위임한다.
//
// 파일 업로드만은 데스크톱에서도 웹뷰 fetch로 보낸다. tauri-plugin-http은 본문을
// 네이티브로 넘기기 전에 Array.from(new Uint8Array(body))로 숫자 배열을 만들고
// 그걸 JSON으로 직렬화한다(플러그인 2.5.9 dist-js/index.js:68). 22MB PDF 하나가
// 2,200만 개짜리 배열과 77MB JSON 문자열이 되어, 보내기도 전에 화면이 몇 초씩
// 멈춘다 — 사용자에게는 "파일 넣으면 렉 걸린다"로 보였다(2026-08-25 QA).
// 서버가 웹뷰 origin(http://tauri.localhost)을 허용하므로(preflight 실측:
// allow-origin·allow-headers 모두 통과) 이 경로는 그냥 웹뷰가 스트리밍해 보낸다.
// 혹시 CORS가 막히면 예전 경로로 한 번 더 — 느려도 올라가는 편이 낫다.
export const httpFetch = async (
  input: string,
  init?: RequestInit,
): Promise<Response> => {
  const options = withClientOs(input, init);

  if (isTauri() && hasBinaryBody(init?.body)) {
    try {
      return await fetch(input, options);
    } catch (err) {
      logDiag('업로드', '웹뷰 fetch가 막혀 플러그인 경로로 재시도', err);
    }
  }

  const fetchFn = await loadFetch();
  if (!isTauri() || !options.signal) return fetchFn(input, options);
  return fetchWithSafeAbort(fetchFn, input, options);
};

// tauri-plugin-http의 abort는 "요청 rid 취소"(fetch_cancel) 하나뿐인데, 응답 헤더가
// 도착한 순간 그 rid는 이미 없다. 그래서 응답을 받은 뒤 abort()가 불리면 —
// 언마운트 정리에서 흔하다(공지 패널은 로그인 성공 직후, 스트림은 작업 전환마다) —
// "The resource id N is invalid" 거부가 처리되지 않은 채 떠서 진단 로그마다 찍혔다
// (2026-08-27 실측: 로그인마다 한 줄). 플러그인에는 요청이 진행 중일 때만 abort를
// 넘기고, 그 뒤의 abort는 본문 취소로 바꾼다(잠긴 스트림이면 조용히 무시).
const fetchWithSafeAbort = async (
  fetchFn: FetchFn,
  input: string,
  options: RequestInit,
): Promise<Response> => {
  const outer = options.signal!;
  const inner = new AbortController();
  let response: Response | null = null;
  const onAbort = () => {
    if (response) void response.body?.cancel().catch(() => {});
    else inner.abort(outer.reason);
  };
  if (outer.aborted) inner.abort(outer.reason);
  else outer.addEventListener('abort', onAbort, { once: true });
  try {
    response = await fetchFn(input, { ...options, signal: inner.signal });
    return response;
  } finally {
    if (!response) outer.removeEventListener('abort', onAbort);
  }
};
