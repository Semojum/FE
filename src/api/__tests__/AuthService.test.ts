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

  it('login returns {accessToken, refreshToken}', async () => {
    fetchSpy.mockResolvedValue(
      makeJsonResponse(
        200,
        envelope({ accessToken: 'acc', refreshToken: 'ref' }),
      ),
    );
    const res = await authService.login('kblib01', 'pw');
    expect(res).toEqual({ accessToken: 'acc', refreshToken: 'ref' });

    const call = fetchSpy.mock.calls[0];
    expect(call[0]).toBe(`${API_BASE_URL}/api/auth/login`);
    expect(bodyJson(call)).toEqual({ loginId: 'kblib01', password: 'pw' });
  });

  it('login failure (401 AUTH4001) throws ApiError', async () => {
    fetchSpy.mockResolvedValue(
      makeJsonResponse(
        401,
        envelope(null, {
          isSuccess: false,
          code: 'AUTH4001',
          message: '아이디 또는 비밀번호가 올바르지 않습니다.',
        }),
      ),
    );
    await expect(authService.login('kblib01', 'wrong')).rejects.toMatchObject({
      code: 'AUTH4001',
      status: 401,
    });
  });

  it('logout sends only {refreshToken} — Authorization 헤더 없음', async () => {
    fetchSpy.mockResolvedValue(makeJsonResponse(200, envelope(null)));
    const res = await authService.logout('ref');
    expect(res).toBeNull();

    const call = fetchSpy.mock.calls[0];
    expect(call[0]).toBe(`${API_BASE_URL}/api/auth/logout`);
    expect(headersOf(call).Authorization).toBeUndefined();
    expect(bodyJson(call)).toEqual({ refreshToken: 'ref' });
  });

  it('refresh sends only {refreshToken} and returns new accessToken', async () => {
    fetchSpy.mockResolvedValue(
      makeJsonResponse(200, envelope({ accessToken: 'new-acc' })),
    );
    const res = await authService.refresh('ref');
    expect(res.accessToken).toBe('new-acc');

    const call = fetchSpy.mock.calls[0];
    expect(call[0]).toBe(`${API_BASE_URL}/api/auth/refresh`);
    expect(headersOf(call).Authorization).toBeUndefined();
    expect(bodyJson(call)).toEqual({ refreshToken: 'ref' });
  });

});
