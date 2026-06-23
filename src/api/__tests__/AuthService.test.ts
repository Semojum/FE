import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as authService from '../AuthService';
import { API_BASE_URL } from '../apiClient';

// mock 제거 후 모든 호출이 실 API(공통 엔벨로프)로 나가므로 fetch를 스텁한다.
const envelope = (result: unknown, overrides: Record<string, unknown> = {}) => ({
  isSuccess: true,
  code: 'COMMON2000',
  message: '성공입니다.',
  result,
  ...overrides,
});

const makeJsonResponse = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });

const initOf = (call: unknown[]) => call[1] as RequestInit;
const headersOf = (call: unknown[]) =>
  initOf(call).headers as Record<string, string>;
const bodyJson = (call: unknown[]) =>
  JSON.parse(initOf(call).body as string) as Record<string, unknown>;

describe('AuthService', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, 'fetch');
  });
  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it('signup POSTs {email,name,password} to /api/auth/signup and returns result', async () => {
    fetchSpy.mockResolvedValue(
      makeJsonResponse(200, envelope({ email: 'a@b.com', name: 'Alice' })),
    );
    const res = await authService.signup('a@b.com', 'pw', 'Alice');
    expect(res).toEqual({ email: 'a@b.com', name: 'Alice' });

    const call = fetchSpy.mock.calls[0];
    expect(call[0]).toBe(`${API_BASE_URL}/api/auth/signup`);
    expect(initOf(call).method).toBe('POST');
    expect(bodyJson(call)).toEqual({
      email: 'a@b.com',
      name: 'Alice',
      password: 'pw',
    });
    expect(headersOf(call)['Content-Type']).toBe('application/json');
  });

  it('login returns {accessToken, refreshToken}', async () => {
    fetchSpy.mockResolvedValue(
      makeJsonResponse(
        200,
        envelope({ accessToken: 'acc', refreshToken: 'ref' }),
      ),
    );
    const res = await authService.login('a@b.com', 'pw');
    expect(res).toEqual({ accessToken: 'acc', refreshToken: 'ref' });

    const call = fetchSpy.mock.calls[0];
    expect(call[0]).toBe(`${API_BASE_URL}/api/auth/login`);
    expect(bodyJson(call)).toEqual({ email: 'a@b.com', password: 'pw' });
  });

  it('login failure (401 AUTH4001) throws ApiError', async () => {
    fetchSpy.mockResolvedValue(
      makeJsonResponse(
        401,
        envelope(null, {
          isSuccess: false,
          code: 'AUTH4001',
          message: '이메일 또는 비밀번호가 올바르지 않습니다.',
        }),
      ),
    );
    await expect(authService.login('a@b.com', 'wrong')).rejects.toMatchObject({
      code: 'AUTH4001',
      status: 401,
    });
  });

  it('logout sends Bearer + {refreshToken} and resolves null', async () => {
    fetchSpy.mockResolvedValue(makeJsonResponse(200, envelope(null)));
    const res = await authService.logout('acc', 'ref');
    expect(res).toBeNull();

    const call = fetchSpy.mock.calls[0];
    expect(call[0]).toBe(`${API_BASE_URL}/api/auth/logout`);
    expect(headersOf(call).Authorization).toBe('Bearer acc');
    expect(bodyJson(call)).toEqual({ refreshToken: 'ref' });
  });

  it('refresh sends Bearer and returns new accessToken', async () => {
    fetchSpy.mockResolvedValue(
      makeJsonResponse(200, envelope({ accessToken: 'new-acc' })),
    );
    const res = await authService.refresh('acc', 'ref');
    expect(res.accessToken).toBe('new-acc');

    const call = fetchSpy.mock.calls[0];
    expect(call[0]).toBe(`${API_BASE_URL}/api/auth/refresh`);
    expect(headersOf(call).Authorization).toBe('Bearer acc');
    expect(bodyJson(call)).toEqual({ refreshToken: 'ref' });
  });

  it('exchangeOAuthCode POSTs to /api/auth/{provider}', async () => {
    fetchSpy.mockResolvedValue(
      makeJsonResponse(
        200,
        envelope({ accessToken: 'acc', refreshToken: 'ref' }),
      ),
    );
    const res = await authService.exchangeOAuthCode('kakao', {
      code: 'c',
      codeVerifier: '',
      redirectUri: 'http://127.0.0.1:4279',
    });
    expect(res.accessToken).toBe('acc');
    expect(fetchSpy.mock.calls[0][0]).toBe(`${API_BASE_URL}/api/auth/kakao`);
  });
});
