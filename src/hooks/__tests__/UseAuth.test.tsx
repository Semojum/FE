import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useAuth } from '../UseAuth';
import { encodeMockJwt } from '../../utils/jwt';

// AuthService를 모킹해 네트워크 없이 훅 로직(토큰 저장/디코드/세션 복구)만 검증한다.
vi.mock('../../api/AuthService', () => ({
  login: vi.fn(),
  signup: vi.fn(),
  logout: vi.fn(),
  refresh: vi.fn(),
}));
import {
  login as apiLogin,
  signup as apiSignup,
  logout as apiLogout,
  refresh as apiRefresh,
} from '../../api/AuthService';

const TOKEN_KEY = 'braillemate-token';
const REFRESH_KEY = 'braillemate-refresh-token';

// useAuth는 accessToken(JWT) payload를 디코드해 사용자 정보를 만든다.
const tokenFor = (email: string, name: string, sub = 'u1') =>
  encodeMockJwt({ sub, email, name });

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
});

describe('useAuth', () => {
  it('starts unauthenticated when no token in localStorage', async () => {
    const { result } = renderHook(() => useAuth());
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.isAuthenticated).toBe(false);
    expect(result.current.user).toBeNull();
  });

  it('login stores tokens and derives user from JWT', async () => {
    vi.mocked(apiLogin).mockResolvedValue({
      accessToken: tokenFor('a@x.com', 'Alice'),
      refreshToken: 'ref',
    });

    const { result } = renderHook(() => useAuth());
    await act(async () => {
      await result.current.login('a@x.com', 'pw');
    });

    expect(result.current.isAuthenticated).toBe(true);
    expect(result.current.user?.email).toBe('a@x.com');
    expect(localStorage.getItem(TOKEN_KEY)).toBeTruthy();
    expect(localStorage.getItem(REFRESH_KEY)).toBe('ref');
  });

  it('signup signs up then logs in (spec: signup issues no token)', async () => {
    vi.mocked(apiSignup).mockResolvedValue({ email: 'h@x.com', name: 'Hook' });
    vi.mocked(apiLogin).mockResolvedValue({
      accessToken: tokenFor('h@x.com', 'Hook'),
      refreshToken: 'ref',
    });

    const { result } = renderHook(() => useAuth());
    await act(async () => {
      await result.current.signup('h@x.com', 'pw', 'Hook');
    });

    expect(apiSignup).toHaveBeenCalledWith('h@x.com', 'pw', 'Hook');
    expect(apiLogin).toHaveBeenCalledWith('h@x.com', 'pw');
    expect(result.current.isAuthenticated).toBe(true);
    expect(result.current.user?.name).toBe('Hook');
  });

  it('login error rejects without setting state', async () => {
    vi.mocked(apiLogin).mockRejectedValue(new Error('bad creds'));

    const { result } = renderHook(() => useAuth());
    await act(async () => {
      await expect(
        result.current.login('nope@x.com', 'pw'),
      ).rejects.toBeDefined();
    });

    expect(result.current.user).toBeNull();
    expect(localStorage.getItem(TOKEN_KEY)).toBeNull();
  });

  it('logout calls server then clears token + user', async () => {
    vi.mocked(apiLogin).mockResolvedValue({
      accessToken: tokenFor('h@x.com', 'Hook'),
      refreshToken: 'ref',
    });
    vi.mocked(apiLogout).mockResolvedValue(null);

    const { result } = renderHook(() => useAuth());
    await act(async () => {
      await result.current.login('h@x.com', 'pw');
    });
    await act(async () => {
      await result.current.logout();
    });

    expect(apiLogout).toHaveBeenCalled();
    expect(result.current.user).toBeNull();
    expect(localStorage.getItem(TOKEN_KEY)).toBeNull();
  });

  it('restores session from localStorage on mount', async () => {
    localStorage.setItem(TOKEN_KEY, tokenFor('seed@x.com', 'Seed'));
    const { result } = renderHook(() => useAuth());
    await waitFor(() => expect(result.current.isAuthenticated).toBe(true));
    expect(result.current.user?.email).toBe('seed@x.com');
  });

  it('clears bogus token from localStorage on mount', async () => {
    localStorage.setItem(TOKEN_KEY, 'invalid-token');
    renderHook(() => useAuth());
    await waitFor(() =>
      expect(localStorage.getItem(TOKEN_KEY)).toBeNull(),
    );
  });

  it('auto-logs in via refresh token when access token is missing/expired', async () => {
    localStorage.setItem(REFRESH_KEY, 'ref');
    vi.mocked(apiRefresh).mockResolvedValue({
      accessToken: tokenFor('auto@x.com', 'Auto'),
    });

    const { result } = renderHook(() => useAuth());
    await waitFor(() => expect(result.current.isAuthenticated).toBe(true));

    expect(apiRefresh).toHaveBeenCalled();
    expect(result.current.user?.email).toBe('auto@x.com');
    expect(localStorage.getItem(TOKEN_KEY)).toBeTruthy();
    expect(result.current.isInitializing).toBe(false);
  });

  it('clears session when refresh token is rejected', async () => {
    localStorage.setItem(REFRESH_KEY, 'stale');
    vi.mocked(apiRefresh).mockRejectedValue(new Error('expired'));

    const { result } = renderHook(() => useAuth());
    await waitFor(() => expect(result.current.isInitializing).toBe(false));

    expect(result.current.isAuthenticated).toBe(false);
    expect(localStorage.getItem(REFRESH_KEY)).toBeNull();
  });
});
