// BE 공통 응답 구조 { isSuccess, code, message, result } 를 처리하는 공용 fetch 래퍼.
// 성공 시 result만 풀어서 반환하고, 실패 시 code/message/status를 담은 ApiError를 throw한다.

import { httpFetch } from './httpFetch';

// 환경별 분기: VITE_API_BASE_URL 미설정 시 운영 호스트로 폴백.
// 개발 환경(.env.development)에서는 빈 문자열로 두어 vite proxy(/api, /oauth2)를 태운다.
export const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ?? 'https://api.semojum.app';

export interface ApiEnvelope<T> {
  isSuccess: boolean;
  code: string;
  message: string;
  result: T;
}

export class ApiError extends Error {
  code: string;
  status: number;
  constructor(message: string, code: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
  }
}

interface RequestOptions {
  method?: string;
  body?: BodyInit | Record<string, unknown> | null;
  token?: string | null;
  headers?: Record<string, string>;
  signal?: AbortSignal;
  // 내부용: 401 리프레시 후 재시도임을 표시(무한 재시도 방지).
  _retried?: boolean;
}

// 프록시(Cloudflare)가 서버 앞단에서 끊는 응답은 JSON이 아니다.
// 명세 "업로드 용량 처리(FE 필독)": 413은 JSON 파싱 전에 상태코드로 먼저 분기해야 한다.
// 502·504 등 게이트웨이 오류도 같은 이유로 여기서 처리한다.
const PROXY_ERRORS: Record<number, { code: string; message: string }> = {
  413: {
    code: 'JOB4009',
    message: '업로드 파일이 100MB를 초과했습니다.',
  },
  502: {
    code: 'COMMON5000',
    message: '서버에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.',
  },
  503: {
    code: 'COMMON5000',
    message: '서버가 일시적으로 응답하지 않습니다. 잠시 후 다시 시도해 주세요.',
  },
  504: {
    code: 'COMMON5000',
    message: '서버 응답이 지연되고 있습니다. 잠시 후 다시 시도해 주세요.',
  },
};

// 401(액세스 토큰 만료/무효) 발생 시 새 accessToken을 발급해 주는 함수.
// useAuth가 마운트 시 등록한다. apiClient가 AuthService/useAuth를 직접 import하면
// 순환 의존이 생기므로, 주입 방식으로 연결한다.
// failedToken: 방금 401을 받은 accessToken. 리프레서는 이 값과 저장된 토큰을 비교해
// "다른 요청이 이미 새로 발급받았는지"를 판단한다(로컬 만료 추정에 의존하지 않음).
type TokenRefresher = (failedToken: string | null) => Promise<string | null>;
let tokenRefresher: TokenRefresher | null = null;
let refreshInFlight: Promise<string | null> | null = null;

export const setTokenRefresher = (fn: TokenRefresher | null): void => {
  tokenRefresher = fn;
};

// 동시에 여러 요청이 401을 받아도 리프레시는 한 번만 수행한다.
const refreshAccessToken = (
  failedToken: string | null,
): Promise<string | null> => {
  if (!tokenRefresher) return Promise.resolve(null);
  if (!refreshInFlight) {
    refreshInFlight = Promise.resolve(tokenRefresher(failedToken)).finally(
      () => {
        refreshInFlight = null;
      },
    );
  }
  return refreshInFlight;
};

export const apiRequest = async <T>(
  path: string,
  options: RequestOptions = {},
): Promise<T> => {
  const { method = 'GET', body, token, headers = {}, signal } = options;
  const finalHeaders: Record<string, string> = { ...headers };
  if (token) finalHeaders.Authorization = `Bearer ${token}`;

  let finalBody: BodyInit | undefined;
  if (body instanceof FormData) {
    // Content-Type은 boundary 포함하여 브라우저가 자동 설정하도록 둔다.
    finalBody = body;
  } else if (body != null) {
    finalHeaders['Content-Type'] = 'application/json';
    finalBody = JSON.stringify(body);
  }

  const res = await httpFetch(`${API_BASE_URL}${path}`, {
    method,
    headers: finalHeaders,
    body: finalBody,
    signal,
  });

  const contentType = res.headers.get('content-type') ?? '';
  const isJson = contentType.includes('application/json');

  // 상태코드 우선 분기 — 프록시가 끊은 응답은 본문이 HTML이라 JSON 파싱이 엉뚱한
  // 에러로 보인다. 서버가 정상 JSON(JOB4009 등)을 준 경우에는 아래 엔벨로프 경로가 처리한다.
  const proxyError = PROXY_ERRORS[res.status];
  if (proxyError && !isJson) {
    throw new ApiError(proxyError.message, proxyError.code, res.status);
  }

  // 🛡️ 방어적 로직: SPA fallback HTML 등 그 밖의 비-JSON 응답 차단
  if (!isJson) {
    const text = await res.text();
    throw new ApiError(
      `응답이 JSON이 아닙니다. URL/프록시 설정을 확인하세요. 미리보기: ${text.slice(0, 50)}`,
      'COMMON5000',
      res.status,
    );
  }

  const envelope = (await res.json()) as ApiEnvelope<T>;
  if (!res.ok || !envelope.isSuccess) {
    const code = envelope.code ?? 'COMMON5000';

    // 액세스 토큰 만료/무효(401) → 리프레시 후 1회 재시도.
    // 제외 대상:
    //  - 인증 엔드포인트(/api/auth/*) 자체 — 무한 루프 방지
    //  - 애초에 토큰을 붙이지 않은 요청 — 재발급해도 달라질 게 없다. 인증이 필요 없다고
    //    알려진 엔드포인트(앱 버전 체크 등)가 401을 주면, 이걸 막지 않을 경우 로그인
    //    전에 리프레시가 돌아 "세션 만료" 상태로 오인된다(2026-08-05 실측).
    const isAuthError =
      res.status === 401 || code === 'COMMON4001' || code === 'AUTH4003';
    if (
      isAuthError &&
      !!token &&
      !options._retried &&
      !path.startsWith('/api/auth/')
    ) {
      const refreshed = await refreshAccessToken(token ?? null);
      if (refreshed) {
        return apiRequest<T>(path, {
          ...options,
          token: refreshed,
          _retried: true,
        });
      }
    }

    throw new ApiError(
      envelope.message ?? `API Error: ${res.status}`,
      code,
      res.status,
    );
  }
  return envelope.result;
};

// Content-Disposition에서 파일명을 뽑는다. 한글 파일명은 RFC 5987
// (filename*=UTF-8''%ED...)로 오고, 없으면 filename="..." 폴백.
export const filenameFromDisposition = (
  disposition: string | null,
): string | null => {
  if (!disposition) return null;
  const encoded = /filename\*=UTF-8''([^;]+)/i.exec(disposition);
  if (encoded) {
    try {
      return decodeURIComponent(encoded[1].trim());
    } catch {
      /* 잘못 인코딩된 값은 아래 폴백으로 */
    }
  }
  const plain = /filename="?([^";]+)"?/i.exec(disposition);
  return plain ? plain[1].trim() : null;
};

export interface BinaryResponse {
  blob: Blob;
  fileName: string | null;
}

// 파일 스트림을 반환하는 엔드포인트(POST /api/jobs/{jobId}/download)용.
// 성공 시 바이너리, 실패 시 공통 엔벨로프(JSON)가 오므로 content-type으로 가른다.
export const apiRequestBinary = async (
  path: string,
  options: RequestOptions = {},
): Promise<BinaryResponse> => {
  const { method = 'GET', body, token, headers = {}, signal } = options;
  const finalHeaders: Record<string, string> = { ...headers };
  if (token) finalHeaders.Authorization = `Bearer ${token}`;

  let finalBody: BodyInit | undefined;
  if (body != null && !(body instanceof FormData)) {
    finalHeaders['Content-Type'] = 'application/json';
    finalBody = JSON.stringify(body);
  } else if (body instanceof FormData) {
    finalBody = body;
  }

  const res = await httpFetch(`${API_BASE_URL}${path}`, {
    method,
    headers: finalHeaders,
    body: finalBody,
    signal,
  });

  const contentType = res.headers.get('content-type') ?? '';

  if (!res.ok || contentType.includes('application/json')) {
    const proxyError = PROXY_ERRORS[res.status];
    if (proxyError && !contentType.includes('application/json')) {
      throw new ApiError(proxyError.message, proxyError.code, res.status);
    }
    if (contentType.includes('application/json')) {
      const envelope = (await res.json()) as ApiEnvelope<unknown>;
      if (!envelope.isSuccess) {
        throw new ApiError(
          envelope.message ?? `API Error: ${res.status}`,
          envelope.code ?? 'COMMON5000',
          res.status,
        );
      }
    }
    if (!res.ok) {
      throw new ApiError(`API Error: ${res.status}`, 'COMMON5000', res.status);
    }
  }

  return {
    blob: await res.blob(),
    fileName: filenameFromDisposition(res.headers.get('content-disposition')),
  };
};
