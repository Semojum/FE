import { apiRequest } from './apiClient';
import { UsageJobs, UsageSummary } from '../types/org';

// [V3] 사용량 API (Figma V3-06 사용량 T3). 로그인한 모든 계정이 쓸 수 있다 —
// 기관 담당자 전용인 /api/org/* 와 달리 역할 제한이 없다.
//
// 2026-08-19 운영 서버 실측: 두 엔드포인트 모두 명세와 같은 형태로 응답한다.

// GET /api/users/usage?month=YYYY-MM — 미지정 시 이번 달(KST).
// "지난달" 탭은 month를 직접 지정해 부른다.
// 무소속 계정은 org* 필드가 전부 null로 온다.
export const getUsageSummary = (
  token: string,
  month?: string,
): Promise<UsageSummary> =>
  apiRequest<UsageSummary>(
    `/api/users/usage${month ? `?month=${encodeURIComponent(month)}` : ''}`,
    { token },
  );

// GET /api/users/usage/jobs?from&to — 기간 미지정 시 최근 30일, 최신순, 휴지통 제외.
export const listUsageJobs = (
  token: string,
  range: { from?: string; to?: string } = {},
): Promise<UsageJobs> => {
  const p = new URLSearchParams();
  if (range.from) p.set('from', range.from);
  if (range.to) p.set('to', range.to);
  const qs = p.toString();
  return apiRequest<UsageJobs>(`/api/users/usage/jobs${qs ? `?${qs}` : ''}`, {
    token,
  });
};
