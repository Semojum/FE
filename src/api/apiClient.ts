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
}

export const apiRequest = async <T>(
  path: string,
  { method = 'GET', body, token, headers = {}, signal }: RequestOptions = {},
): Promise<T> => {
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
    throw new ApiError(
      envelope.message ?? `API Error: ${res.status}`,
      envelope.code ?? 'COMMON5000',
      res.status,
    );
  }
  return envelope.result;
};
