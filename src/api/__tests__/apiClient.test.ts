import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { apiRequest, setTokenRefresher, API_BASE_URL } from '../apiClient';

const envelope = (result: unknown, overrides: Record<string, unknown> = {}) => ({
  isSuccess: true,
  code: 'COMMON2000',
  message: '성공입니다.',
  result,
  ...overrides,
});

const jsonResponse = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });

const unauthorized = () =>
  jsonResponse(
    401,
    envelope(null, {
      isSuccess: false,
      code: 'COMMON4001',
      message: '인증이 필요합니다.',
    }),
  );

describe('apiRequest 401 자동 리프레시', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, 'fetch');
  });
  afterEach(() => {
    fetchSpy.mockRestore();
    setTokenRefresher(null);
  });

  it('401이면 리프레시 후 새 토큰으로 1회 재시도한다', async () => {
    fetchSpy
      .mockResolvedValueOnce(unauthorized())
      .mockResolvedValueOnce(jsonResponse(200, envelope({ ok: true })));
    const refresher = vi.fn().mockResolvedValue('new-token');
    setTokenRefresher(refresher);

    const res = await apiRequest('/api/users/jobs', { token: 'expired' });

    expect(res).toEqual({ ok: true });
    expect(refresher).toHaveBeenCalledTimes(1);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    // 재시도는 새 토큰으로 나간다
    const retryHeaders = (fetchSpy.mock.calls[1][1] as RequestInit)
      .headers as Record<string, string>;
    expect(retryHeaders.Authorization).toBe('Bearer new-token');
  });

  it('리프레시가 실패(null)하면 401을 그대로 throw한다', async () => {
    fetchSpy.mockResolvedValue(unauthorized());
    setTokenRefresher(vi.fn().mockResolvedValue(null));

    await expect(
      apiRequest('/api/users/jobs', { token: 'expired' }),
    ).rejects.toMatchObject({ code: 'COMMON4001', status: 401 });
    // 원요청 1회만 — 재시도 없음
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('인증 엔드포인트(/api/auth/*)는 401이어도 리프레시 재시도하지 않는다', async () => {
    fetchSpy.mockResolvedValue(unauthorized());
    const refresher = vi.fn().mockResolvedValue('new-token');
    setTokenRefresher(refresher);

    await expect(
      apiRequest('/api/auth/login', { method: 'POST', body: {} }),
    ).rejects.toMatchObject({ code: 'COMMON4001' });
    expect(refresher).not.toHaveBeenCalled();
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy.mock.calls[0][0]).toBe(`${API_BASE_URL}/api/auth/login`);
  });
});
