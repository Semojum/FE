import { AuthResponse, User } from '../types/auth';
import { mockBackend } from './MockBackend';

// 임시: 실제 백엔드 인증 endpoint가 준비되기 전까지 mock 사용.
// 환경 변수 VITE_USE_MOCK_API=false 로 명시적으로 끄지 않으면 mock.
const USE_MOCK =
  (import.meta.env.VITE_USE_MOCK_API ?? 'true') !== 'false';

export const signup = (
  email: string,
  password: string,
  name: string,
): Promise<AuthResponse> => {
  if (USE_MOCK) return mockBackend.signup(email, password, name);
  throw new Error('실제 인증 API가 아직 구현되지 않았습니다.');
};

export const login = (
  email: string,
  password: string,
): Promise<AuthResponse> => {
  if (USE_MOCK) return mockBackend.login(email, password);
  throw new Error('실제 인증 API가 아직 구현되지 않았습니다.');
};

export const me = (token: string): Promise<User> => {
  if (USE_MOCK) return mockBackend.me(token);
  throw new Error('실제 인증 API가 아직 구현되지 않았습니다.');
};

export const logout = (token: string): Promise<void> => {
  if (USE_MOCK) return mockBackend.logout(token);
  throw new Error('실제 인증 API가 아직 구현되지 않았습니다.');
};
