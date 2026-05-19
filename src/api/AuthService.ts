import { AuthResponse, User } from '../types/auth';
import { mockBackend } from './MockBackend';
import { USE_MOCK_API } from './featureFlags';

export const signup = (
  email: string,
  password: string,
  name: string,
): Promise<AuthResponse> => {
  if (USE_MOCK_API) return mockBackend.signup(email, password, name);
  throw new Error('실제 인증 API가 아직 구현되지 않았습니다.');
};

export const login = (
  email: string,
  password: string,
): Promise<AuthResponse> => {
  if (USE_MOCK_API) return mockBackend.login(email, password);
  throw new Error('실제 인증 API가 아직 구현되지 않았습니다.');
};

export const me = (token: string): Promise<User> => {
  if (USE_MOCK_API) return mockBackend.me(token);
  throw new Error('실제 인증 API가 아직 구현되지 않았습니다.');
};

export const logout = (token: string): Promise<void> => {
  if (USE_MOCK_API) return mockBackend.logout(token);
  throw new Error('실제 인증 API가 아직 구현되지 않았습니다.');
};
