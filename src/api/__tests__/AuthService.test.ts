import { describe, it, expect } from 'vitest';
import * as authService from '../AuthService';

// 기본 설정에서 VITE_USE_MOCK_API !== 'false' 이므로 모든 호출이 mockBackend로 위임됨.
describe('AuthService (mock-backed)', () => {
  it('signup → login → me → logout 전 흐름이 동작', async () => {
    const signupRes = await authService.signup(
      'svc@x.com',
      'pw',
      'Service User',
    );
    expect(signupRes.token).toEqual(expect.any(String));
    expect(signupRes.user.email).toBe('svc@x.com');

    const loginRes = await authService.login('svc@x.com', 'pw');
    expect(loginRes.user.email).toBe('svc@x.com');

    const me = await authService.me(loginRes.token);
    expect(me.name).toBe('Service User');

    await authService.logout(loginRes.token);
    await expect(authService.me(loginRes.token)).rejects.toBeDefined();
  });

  it('login 실패는 에러를 throw', async () => {
    await expect(
      authService.login('no-such@x.com', 'pw'),
    ).rejects.toBeDefined();
  });
});
