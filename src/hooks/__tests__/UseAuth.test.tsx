import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
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

// 운영 서버의 accessToken payload는 { sub, iat, exp }뿐이고 sub은 사용자 UUID다.
// 표시용 loginId는 로그인 입력값에서 온다.
const realWorldToken = () =>
  encodeMockJwt({
    sub: 'cc6c7a9d-c40e-484a-b48e-fcc527b92fbd',
    exp: Math.floor(Date.now() / 1000) + 3600,
  });
const tokenFor = (_loginId?: string) => realWorldToken();

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
    // JWT에 loginId가 없어도(sub은 UUID) 입력한 아이디를 그대로 보여준다.
    expect(result.current.user?.loginId).toBe('kblib01');
    // 다음 실행 때 로그인 화면에 미리 채우려고 아이디만 남긴다.
    expect(localStorage.getItem('semojum.lastLoginId')).toBe('kblib01');
  });

  it('로그인 응답의 role을 세션 내내 들고 있는다 (기관 관리 진입 판단용)', async () => {
    // accessToken payload에는 역할이 없다 — 역할은 로그인 응답의 role뿐이고,
    // 리프레시 응답에는 다시 오지 않는다(2026-08-19 운영 서버 실측).
    vi.mocked(apiLogin).mockResolvedValue({
      accessToken: tokenFor('kblib01'),
      refreshToken: 'ref',
      role: 'ROLE_ORG_ADMIN',
    });
    vi.mocked(apiRefresh).mockResolvedValue({ accessToken: tokenFor() });

    const { result } = renderHook(() => useAuth());
    await act(async () => {
      await result.current.login('kblib01', 'pw');
    });
    expect(result.current.user?.role).toBe('ROLE_ORG_ADMIN');

    await act(async () => {
      await result.current.refreshSession();
    });
    expect(result.current.user?.role).toBe('ROLE_ORG_ADMIN');

    await act(async () => {
      await result.current.logout();
    });
    expect(result.current.user).toBeNull();
  });

  it('로그인에 실패하면 아이디를 기억하지 않는다', async () => {
    vi.mocked(apiLogin).mockRejectedValue(
      new ApiError(
        '아이디 또는 비밀번호가 올바르지 않습니다.',
        'AUTH4001',
        401,
      ),
    );

    const { result } = renderHook(() => useAuth());
    await act(async () => {
      await result.current.login('kblib01', 'wrong').catch(() => undefined);
    });

    expect(localStorage.getItem('semojum.lastLoginId')).toBeNull();
  });

  it('토큰을 재발급해도 표시용 loginId를 잃지 않는다', async () => {
    vi.mocked(apiLogin).mockResolvedValue({
      accessToken: realWorldToken(),
      refreshToken: 'ref',
    });
    vi.mocked(apiRefresh).mockResolvedValue({ accessToken: realWorldToken() });

    const { result } = renderHook(() => useAuth());
    await act(async () => {
      await result.current.login('org0102', 'pw');
    });
    await act(async () => {
      await result.current.refreshSession(result.current.token);
    });

    expect(result.current.user?.loginId).toBe('org0102');
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

    // 남기는 것은 다음 로그인 화면에 미리 채울 아이디뿐이다 — 토큰·비밀번호는 없다.
    const stored = Object.keys(localStorage).map((k) =>
      localStorage.getItem(k),
    );
    expect(stored).toEqual(['kblib01']);
    expect(stored.join('|')).not.toContain('ref');
    expect(stored.join('|')).not.toContain(result.current.token);
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

  it('그 밖의 인증 거절은 expired 사유로 끊는다', async () => {
    vi.mocked(apiLogin).mockResolvedValue({
      accessToken: tokenFor('kblib01'),
      refreshToken: 'ref',
    });
    vi.mocked(apiRefresh).mockRejectedValue(
      new ApiError('인증이 필요합니다.', 'COMMON4001', 401),
    );

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

  // 지하철·절전 등으로 잠깐 끊긴 것을 세션 종료로 오인하면 작업 중인 화면이 날아간다.
  it('네트워크 오류로는 세션을 끊지 않는다', async () => {
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

    expect(result.current.isAuthenticated).toBe(true);
    expect(result.current.sessionEndedReason).toBeNull();
  });

  // 실서버 실측(2026-08-20): 다른 기기에서 로그인해도 밀려난 세션의 accessToken은
  // 만료(1시간) 전까지 200을 준다 — 요청이 401을 받길 기다리면 로그아웃되지 않는다.
  // 그래서 리프레시를 주기적으로 두드려 스스로 알아채야 한다.
  describe('중복 로그인 감지', () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    const loginAndRun = async () => {
      vi.mocked(apiLogin).mockResolvedValue({
        accessToken: tokenFor('kblib01'),
        refreshToken: 'ref',
      });
      const { result } = renderHook(() => useAuth());
      await act(async () => {
        await result.current.login('kblib01', 'pw');
      });
      return result;
    };

    it('주기적으로 세션을 확인하다가 AUTH4003이면 evicted로 끊는다', async () => {
      const result = await loginAndRun();
      expect(result.current.isAuthenticated).toBe(true);

      vi.mocked(apiRefresh).mockRejectedValue(
        new ApiError('만료되었거나 유효하지 않습니다.', 'AUTH4003', 401),
      );
      await act(async () => {
        await vi.advanceTimersByTimeAsync(60_000);
      });

      expect(apiRefresh).toHaveBeenCalledWith('ref');
      expect(result.current.isAuthenticated).toBe(false);
      expect(result.current.sessionEndedReason).toBe('evicted');
    });

    // 60초마다 토큰을 갈아 끼우면 token을 의존성으로 쓰는 화면·SSE 스트림이
    // 매분 다시 붙는다(2026-08-20 "서버 오류" 토스트의 원인). 확인만 하고 둔다.
    it('세션이 살아 있으면 토큰을 그대로 두고 로그인을 유지한다', async () => {
      const result = await loginAndRun();
      const before = result.current.token;

      vi.mocked(apiRefresh).mockResolvedValue({
        accessToken: encodeMockJwt({
          sub: '00000000-0000-4000-8000-000000000001',
          exp: Math.floor(Date.now() / 1000) + 3600,
        }),
      });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(60_000);
      });

      expect(apiRefresh).toHaveBeenCalled();
      expect(result.current.isAuthenticated).toBe(true);
      expect(result.current.token).toBe(before);
    });

    it('만료가 가까우면 확인하는 김에 새 토큰으로 바꾼다', async () => {
      vi.mocked(apiLogin).mockResolvedValue({
        // 4분 뒤 만료 — 다음 확인 때 교체 대상이다.
        accessToken: encodeMockJwt({
          sub: 'cc6c7a9d-c40e-484a-b48e-fcc527b92fbd',
          exp: Math.floor(Date.now() / 1000) + 240,
        }),
        refreshToken: 'ref',
      });
      const { result } = renderHook(() => useAuth());
      await act(async () => {
        await result.current.login('kblib01', 'pw');
      });
      const before = result.current.token;

      const renewed = encodeMockJwt({
        sub: '00000000-0000-4000-8000-000000000001',
        exp: Math.floor(Date.now() / 1000) + 3600,
      });
      vi.mocked(apiRefresh).mockResolvedValue({ accessToken: renewed });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(60_000);
      });

      expect(result.current.token).toBe(renewed);
      expect(result.current.token).not.toBe(before);
    });

    it('로그아웃한 뒤에는 더 이상 확인하지 않는다', async () => {
      const result = await loginAndRun();
      vi.mocked(apiLogout).mockResolvedValue(null);
      await act(async () => {
        await result.current.logout();
      });

      vi.mocked(apiRefresh).mockClear();
      await act(async () => {
        await vi.advanceTimersByTimeAsync(180_000);
      });
      expect(apiRefresh).not.toHaveBeenCalled();
    });
  });
});
