import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useAuth } from '../UseAuth';
import { encodeMockJwt } from '../../utils/jwt';
import { ApiError } from '../../api/apiClient';

// AuthService를 모킹해 네트워크 없이 훅 로직(토큰 보관/디코드/세션 종료)만 검증한다.
vi.mock('../../api/AuthService', () => ({
  login: vi.fn(),
  logout: vi.fn(),
  refresh: vi.fn(),
}));
import {
  login as apiLogin,
  logout as apiLogout,
  refresh as apiRefresh,
} from '../../api/AuthService';

// useAuth는 accessToken(JWT) payload를 디코드해 사용자 정보를 만든다. V3 식별자는 loginId.
const tokenFor = (loginId: string) => encodeMockJwt({ sub: loginId, loginId });

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
});

describe('useAuth', () => {
  it('starts unauthenticated (V3는 자동 로그인이 없다)', async () => {
    const { result } = renderHook(() => useAuth());
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.isAuthenticated).toBe(false);
    expect(result.current.user).toBeNull();
  });

  it('login derives user from JWT loginId', async () => {
    vi.mocked(apiLogin).mockResolvedValue({
      accessToken: tokenFor('kblib01'),
      refreshToken: 'ref',
    });

    const { result } = renderHook(() => useAuth());
    await act(async () => {
      await result.current.login('kblib01', 'pw');
    });

    expect(apiLogin).toHaveBeenCalledWith('kblib01', 'pw');
    expect(result.current.isAuthenticated).toBe(true);
    expect(result.current.user?.loginId).toBe('kblib01');
  });

  it('토큰을 localStorage에 남기지 않는다 (기관 계정 공유 대비)', async () => {
    vi.mocked(apiLogin).mockResolvedValue({
      accessToken: tokenFor('kblib01'),
      refreshToken: 'ref',
    });

    const { result } = renderHook(() => useAuth());
    await act(async () => {
      await result.current.login('kblib01', 'pw');
    });

    expect(localStorage.length).toBe(0);
    // 새로 마운트하면(=앱 재실행) 로그인 화면부터 시작한다.
    const fresh = renderHook(() => useAuth());
    expect(fresh.result.current.isAuthenticated).toBe(false);
  });

  it('login error rejects without setting state', async () => {
    vi.mocked(apiLogin).mockRejectedValue(
      new ApiError(
        '아이디 또는 비밀번호가 올바르지 않습니다.',
        'AUTH4001',
        401,
      ),
    );

    const { result } = renderHook(() => useAuth());
    await act(async () => {
      await expect(result.current.login('nope', 'pw')).rejects.toBeDefined();
    });

    expect(result.current.user).toBeNull();
  });

  it('logout revokes refresh token then clears session', async () => {
    vi.mocked(apiLogin).mockResolvedValue({
      accessToken: tokenFor('kblib01'),
      refreshToken: 'ref',
    });
    vi.mocked(apiLogout).mockResolvedValue(null);

    const { result } = renderHook(() => useAuth());
    await act(async () => {
      await result.current.login('kblib01', 'pw');
    });
    await act(async () => {
      await result.current.logout();
    });

    expect(apiLogout).toHaveBeenCalledWith('ref');
    expect(result.current.user).toBeNull();
    expect(result.current.sessionEndedReason).toBeNull();
  });

  it('refreshSession swaps in a new access token', async () => {
    vi.mocked(apiLogin).mockResolvedValue({
      accessToken: tokenFor('kblib01'),
      refreshToken: 'ref',
    });
    const renewed = tokenFor('kblib01');
    vi.mocked(apiRefresh).mockResolvedValue({ accessToken: renewed });

    const { result } = renderHook(() => useAuth());
    await act(async () => {
      await result.current.login('kblib01', 'pw');
    });
    const stale = result.current.token;

    await act(async () => {
      await result.current.refreshSession(stale);
    });

    expect(apiRefresh).toHaveBeenCalledWith('ref');
    expect(result.current.isAuthenticated).toBe(true);
  });

  it('AUTH4003(밀려난 세션)이면 evicted 사유로 세션을 끊는다', async () => {
    vi.mocked(apiLogin).mockResolvedValue({
      accessToken: tokenFor('kblib01'),
      refreshToken: 'ref',
    });
    vi.mocked(apiRefresh).mockRejectedValue(
      new ApiError('만료되었거나 유효하지 않습니다.', 'AUTH4003', 401),
    );

    const { result } = renderHook(() => useAuth());
    await act(async () => {
      await result.current.login('kblib01', 'pw');
    });
    await act(async () => {
      await result.current.refreshSession(result.current.token);
    });

    expect(result.current.isAuthenticated).toBe(false);
    expect(result.current.sessionEndedReason).toBe('evicted');
  });

  it('그 밖의 재발급 실패는 expired 사유로 끊는다', async () => {
    vi.mocked(apiLogin).mockResolvedValue({
      accessToken: tokenFor('kblib01'),
      refreshToken: 'ref',
    });
    vi.mocked(apiRefresh).mockRejectedValue(new Error('network'));

    const { result } = renderHook(() => useAuth());
    await act(async () => {
      await result.current.login('kblib01', 'pw');
    });
    await act(async () => {
      await result.current.refreshSession(result.current.token);
    });

    expect(result.current.sessionEndedReason).toBe('expired');

    act(() => result.current.acknowledgeSessionEnded());
    expect(result.current.sessionEndedReason).toBeNull();
  });
});
