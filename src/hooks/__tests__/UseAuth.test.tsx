import { describe, it, expect } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useAuth } from '../UseAuth';
import { mockBackend } from '../../api/MockBackend';

const TOKEN_KEY = 'braillemate-token';

describe('useAuth', () => {
  it('starts unauthenticated when no token in localStorage', async () => {
    const { result } = renderHook(() => useAuth());
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.isAuthenticated).toBe(false);
    expect(result.current.user).toBeNull();
  });

  it('signup populates user + persists token to localStorage', async () => {
    const { result } = renderHook(() => useAuth());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.signup('hook@x.com', 'pw', 'Hook');
    });

    expect(result.current.isAuthenticated).toBe(true);
    expect(result.current.user?.email).toBe('hook@x.com');
    expect(localStorage.getItem(TOKEN_KEY)).toBeTruthy();
  });

  it('login uses existing user', async () => {
    await mockBackend.signup('hook@x.com', 'pw', 'Hook');

    const { result } = renderHook(() => useAuth());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.login('hook@x.com', 'pw');
    });

    expect(result.current.user?.name).toBe('Hook');
  });

  it('login error rejects without setting state', async () => {
    const { result } = renderHook(() => useAuth());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await expect(
        result.current.login('nope@x.com', 'pw'),
      ).rejects.toBeDefined();
    });

    expect(result.current.user).toBeNull();
    expect(localStorage.getItem(TOKEN_KEY)).toBeNull();
  });

  it('logout clears token + user', async () => {
    const { result } = renderHook(() => useAuth());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.signup('hook@x.com', 'pw', 'Hook');
    });
    await act(async () => {
      await result.current.logout();
    });

    expect(result.current.user).toBeNull();
    expect(localStorage.getItem(TOKEN_KEY)).toBeNull();
  });

  it('restores session from localStorage on mount', async () => {
    const auth = await mockBackend.signup('seed@x.com', 'pw', 'Seed');
    localStorage.setItem(TOKEN_KEY, auth.token);

    const { result } = renderHook(() => useAuth());
    await waitFor(() => expect(result.current.isAuthenticated).toBe(true));
    expect(result.current.user?.email).toBe('seed@x.com');
  });

  it('clears bogus token from localStorage if me() fails', async () => {
    localStorage.setItem(TOKEN_KEY, 'invalid-token');
    const { result } = renderHook(() => useAuth());
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.isAuthenticated).toBe(false);
    expect(localStorage.getItem(TOKEN_KEY)).toBeNull();
  });
});
