import { describe, it, expect } from 'vitest';
import * as authService from '../AuthService';
import { decodeJwt } from '../../utils/jwt';

// 기본 설정에서 VITE_USE_MOCK_API !== 'false' 이므로 모든 호출이 mockBackend로 위임됨.
describe('AuthService (mock-backed)', () => {
  it('signup은 토큰 없이 { email, name }만 반환', async () => {
    const res = await authService.signup('svc@x.com', 'pw', 'Service User');
    expect(res).toEqual({ email: 'svc@x.com', name: 'Service User' });
  });

  it('login은 디코드 가능한 accessToken/refreshToken을 반환', async () => {
    await authService.signup('svc2@x.com', 'pw', 'Svc2');
    const res = await authService.login('svc2@x.com', 'pw');
    expect(res.accessToken).toEqual(expect.any(String));
    expect(res.refreshToken).toEqual(expect.any(String));

    const payload = decodeJwt(res.accessToken);
    expect(payload?.email).toBe('svc2@x.com');
    expect(payload?.name).toBe('Svc2');
    expect(payload?.sub).toEqual(expect.any(String));
  });

  it('login 실패는 에러를 throw', async () => {
    await expect(
      authService.login('no-such@x.com', 'pw'),
    ).rejects.toBeDefined();
  });

  it('logout은 정상 처리된다 (mock no-op)', async () => {
    await authService.signup('lo@x.com', 'pw', 'Lo');
    const { accessToken, refreshToken } = await authService.login(
      'lo@x.com',
      'pw',
    );
    await expect(
      authService.logout(accessToken, refreshToken),
    ).resolves.toBeNull();
  });

  it('refresh는 refreshToken으로 새 accessToken을 재발급', async () => {
    await authService.signup('rf@x.com', 'pw', 'Rf');
    const { accessToken, refreshToken } = await authService.login(
      'rf@x.com',
      'pw',
    );
    const res = await authService.refresh(accessToken, refreshToken);
    expect(res.accessToken).toEqual(expect.any(String));

    const payload = decodeJwt(res.accessToken);
    expect(payload?.email).toBe('rf@x.com');
  });

  it('refresh는 만료/손상된 refreshToken에 대해 throw', async () => {
    await expect(
      authService.refresh(null, 'bogus-token'),
    ).rejects.toBeDefined();
  });
});
