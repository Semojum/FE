// OAuth2 Authorization Code + PKCE 보조 유틸 (브라우저 전용).
// - createPkcePair: code_verifier 와 S256 code_challenge 생성 (구글 등 PKCE 사용처)
// - randomState: CSRF 방지용 state 값 생성

const BASE64URL_CHARS =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

// 암호학적 난수로 base64url 문자만 사용하는 문자열 생성
const randomString = (length: number): string => {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  let out = '';
  for (const b of bytes) out += BASE64URL_CHARS[b % BASE64URL_CHARS.length];
  return out;
};

// ArrayBuffer → base64url (패딩 제거)
const bufferToBase64Url = (buffer: ArrayBuffer): string => {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

export interface PkcePair {
  verifier: string;
  challenge: string;
}

// code_verifier(43~128자)와 그 SHA-256 해시를 base64url로 인코딩한 code_challenge 생성
export const createPkcePair = async (): Promise<PkcePair> => {
  const verifier = randomString(64);
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(verifier),
  );
  return { verifier, challenge: bufferToBase64Url(digest) };
};

// OAuth state (CSRF 방지) 값
export const randomState = (): string => randomString(32);
