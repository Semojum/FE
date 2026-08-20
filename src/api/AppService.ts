import { apiRequest } from './apiClient';

// 서버가 알려 주는 배포 정보. 2026-08-20 실측으로 경로와 형태가 바뀌었다 —
// 옛 경로 GET /api/app/version은 404 COMMON4004고, 무인증 공개 경로가 새로 생겼다.
// forceUpdate도 더 이상 서버가 계산해 주지 않아 FE가 버전을 비교한다.
export interface AppVersionInfo {
  latestVersion: string;
  minSupportedVersion: string;
  // 설치 파일 주소(업데이터를 쓰지 못하는 경우의 안내용). 없을 수 있다.
  downloadUrl: string | null;
  // 릴리스 노트 "본문". 예전의 releaseNoteUrl(주소)이 아니다.
  releaseNotes: string | null;
  updatedAt: string | null;
}

// GET /api/public/app-version — 인증 불필요(로그인 전·토큰 만료 상태에서도 호출).
// result가 null이면 버전 정보 미등록 — 검사를 생략하고 그대로 진행한다(fail-safe).
export const getAppVersion = (): Promise<AppVersionInfo | null> =>
  apiRequest<AppVersionInfo | null>('/api/public/app-version');

// '1.10.0' > '1.9.9' — 명세 명시: 문자열 비교 금지, 숫자 단위로 비교한다.
// a<b면 음수, 같으면 0, a>b면 양수.
export const compareVersions = (a: string, b: string): number => {
  const pa = a.split('.').map((n) => Number.parseInt(n, 10) || 0);
  const pb = b.split('.').map((n) => Number.parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
};
