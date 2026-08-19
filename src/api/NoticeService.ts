import { apiRequest, ApiError } from './apiClient';
import { PublicNotice } from '../types/org';

// 로그인 화면 공지 — 인증 없이 부르는 유일한 조회다.
//
// 2026-08-19 실측: 서버에는 아직 이 경로가 없다(404 COMMON4004). 공지 읽기는
// ROLE_ORG_ADMIN 전용 `GET /api/org/notices` 하나뿐이라 로그인 전에는 쓸 수 없어서,
// BE가 열어 줄 공개 경로를 전제로 미리 붙여 둔다. 없는 동안에는 null을 돌려
// 로그인 화면이 패널을 아예 그리지 않게 한다(빈 상자도, 오류 문구도 띄우지 않는다).
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
