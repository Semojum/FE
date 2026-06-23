// BE 공통 응답 구조 { isSuccess, code, message, result } 를 처리하는 공용 fetch 래퍼.
// 성공 시 result만 풀어서 반환하고, 실패 시 code/message/status를 담은 ApiError를 throw한다.

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
const refreshAccessToken = (failedToken: string | null): Promise<string | null> => {
  if (!tokenRefresher) return Promise.resolve(null);
  if (!refreshInFlight) {
    refreshInFlight = Promise.resolve(tokenRefresher(failedToken)).finally(() => {
      refreshInFlight = null;
    });
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

  const res = await fetch(`${API_BASE_URL}${path}`, {
    method,
    headers: finalHeaders,
    body: finalBody,
    signal,
  });

  // 🛡️ 방어적 로직: SPA fallback HTML 등 비-JSON 응답 차단
  const contentType = res.headers.get('content-type') ?? '';
  if (!contentType.includes('application/json')) {
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
    // 인증 엔드포인트(/api/auth/*) 자체는 재시도 대상에서 제외(무한 루프 방지).
    const isAuthError =
      res.status === 401 || code === 'COMMON4001' || code === 'AUTH4003';
    if (isAuthError && !options._retried && !path.startsWith('/api/auth/')) {
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
