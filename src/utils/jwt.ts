// 브라우저에서 JWT payload를 읽기 위한 경량 유틸.
// 서명은 검증하지 않는다 — 명세상 GET /me가 없으므로 accessToken(JWT)의
// payload(email/name/sub/exp)만 사용자 정보 표시 용도로 디코드한다.
// encodeMockJwt는 mock 백엔드가 동일한 디코드 경로를 타도록 가짜 토큰을 만들 때 쓴다.

export interface JwtPayload {
  sub?: string;
  email?: string;
  name?: string;
  exp?: number; // epoch seconds
  [key: string]: unknown;
}

const toBase64Url = (binary: string): string =>
  btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

const fromBase64Url = (input: string): string => {
  const normalized = input.replace(/-/g, '+').replace(/_/g, '/');
  const pad =
    normalized.length % 4 === 0 ? '' : '='.repeat(4 - (normalized.length % 4));
  return atob(normalized + pad);
};

// UTF-8(한글 이름 등) 안전 인코딩/디코딩
const utf8ToBase64Url = (str: string): string => {
  let binary = '';
  new TextEncoder().encode(str).forEach((b) => {
    binary += String.fromCharCode(b);
  });
  return toBase64Url(binary);
};

const base64UrlToUtf8 = (b64: string): string => {
  const binary = fromBase64Url(b64);
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
};

export const decodeJwt = (
  token: string | null | undefined,
): JwtPayload | null => {
  if (!token) return null;
  const parts = token.split('.');
  if (parts.length < 2) return null;
  try {
    return JSON.parse(base64UrlToUtf8(parts[1])) as JwtPayload;
  } catch {
    return null;
  }
};

export const isExpired = (payload: JwtPayload | null): boolean => {
  if (!payload?.exp) return false; // exp가 없으면 만료로 간주하지 않음
  return payload.exp * 1000 <= Date.now();
};

// mock 백엔드 전용: 서명 없는, 디코드 가능한 가짜 JWT 생성
export const encodeMockJwt = (payload: JwtPayload): string => {
  const header = utf8ToBase64Url(JSON.stringify({ alg: 'none', typ: 'JWT' }));
  const body = utf8ToBase64Url(JSON.stringify(payload));
  return `${header}.${body}.mock`;
};
