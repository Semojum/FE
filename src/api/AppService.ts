import { apiRequest } from './apiClient';

export interface AppVersionInfo {
  latestVersion: string;
  minSupportedVersion: string;
  // current < minSupportedVersion 여부를 서버가 계산해 내려준다.
  forceUpdate: boolean;
  releaseNoteUrl: string;
}

// GET /api/app/version?current=3.0.1 — 인증 불필요(로그인 전·토큰 만료 상태에서도 호출).
// forceUpdate면 FE는 화면을 잠그고 업데이트 외의 조작을 막는다(자동 업데이트 D-1).
export const getAppVersion = (current: string): Promise<AppVersionInfo> =>
  apiRequest<AppVersionInfo>(
    `/api/app/version?current=${encodeURIComponent(current)}`,
  );
