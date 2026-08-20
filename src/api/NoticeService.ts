import { apiRequest, ApiError } from './apiClient';
import { PublicNotice } from '../types/org';

// 로그인 화면 공지 — 인증 없이 부르는 유일한 조회다.
//
// 2026-08-20 실측: 서버가 이 경로를 열었다(08-19에는 404 COMMON4004라 패널이 늘 숨어 있었다).
// 그래도 미배포·오류일 때 null을 돌리는 처리는 그대로 둔다 — 구버전 서버에 붙어도
// 로그인 화면이 빈 상자나 오류 문구를 띄우지 않아야 한다.
//
// 로그인은 어떤 경우에도 막히면 안 되므로 이 조회는 실패해도 조용히 넘어간다.

const PATH = '/api/public/notices';

// 목록 응답이 배열로 올 수도, { items: [...] }로 올 수도 있어 양쪽을 흡수한다
// (마이페이지 목록이 명세와 배포본이 어긋났던 전례가 있다 — FolderService 주석 참고).
type RawNotices = PublicNotice[] | { items?: PublicNotice[] } | null;

const normalize = (raw: RawNotices): PublicNotice[] => {
  if (Array.isArray(raw)) return raw;
  return raw?.items ?? [];
};

// 서버가 이 기능을 아직 배포하지 않았음을 뜻하는 응답.
//  · 404 COMMON4004  — 경로 없음
//  · 401 COMMON4001  — 인증을 요구하도록 붙어 있음(로그인 전에는 쓸 수 없다)
const isUnavailable = (err: unknown): boolean =>
  err instanceof ApiError &&
  (err.status === 404 ||
    err.status === 401 ||
    err.code === 'COMMON4004' ||
    err.code === 'COMMON4001');

/**
 * 노출 기간 안의 전체 공지를 가져온다.
 * 반환값 null = 보여 줄 수 없음(미배포·오류) → 호출부는 패널을 숨긴다.
 */
export const listPublicNotices = async (
  signal?: AbortSignal,
): Promise<PublicNotice[] | null> => {
  try {
    const raw = await apiRequest<RawNotices>(PATH, { signal });
    return normalize(raw);
  } catch (err) {
    if (!isUnavailable(err)) {
      // 네트워크·서버 오류는 원인 파악에 필요하니 콘솔에만 남긴다.
      console.warn('[공지] 불러오지 못했습니다:', err);
    }
    return null;
  }
};
