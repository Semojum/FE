import { apiRequest } from './apiClient';
import { httpFetch } from './httpFetch';
import {
  OrgAccount,
  OrgAccountJobs,
  OrgAccountList,
  OrgDashboard,
  OrgLockResult,
  OrgNotice,
  OrgOrders,
  OrgReceiptLink,
  OrgRequest,
  OrgRequestType,
} from '../types/org';

// [V3] 기관 담당자 API (Figma V3-06 기관 관리 · 계정 상세).
// 전부 ROLE_ORG_ADMIN 전용이라, 그 밖의 역할은 COMMON4003(403)을 받는다.
// 계정 발급·삭제·비밀번호 재발급은 세모점(운영자) 소관이며 여기서는 다루지 않는다 —
// 이 화면이 직접 바꿀 수 있는 것은 별칭과 잠금뿐이고, 나머지는 "요청"으로 접수한다.

const query = (params: Record<string, string | undefined>): string => {
  const p = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v) p.set(k, v);
  });
  const s = p.toString();
  return s ? `?${s}` : '';
};

// GET /api/org/dashboard — 계약·크레딧·최근 6개월 사용 추이.
// D-day("11일 남음")와 소진 예상은 서버가 주지 않는다(FE 계산).
export const getOrgDashboard = (token: string): Promise<OrgDashboard> =>
  apiRequest<OrgDashboard>('/api/org/dashboard', { token });

// GET /api/org/accounts — 정렬은 loginId(발급 순서). 파라미터 없음.
//
// ⚠️ 2026-08-20 명세 정정: "사용"이 월 단위에서 **계약 시작일 이후 누적**으로 바뀌면서
// 응답 필드 이름이 셋 바뀌었다(month→usageSince, monthCredits→usedCredits, self→isSelf).
// 옛 이름으로 주는 배포본이 남아 있어도 화면이 깨지지 않도록 양쪽을 흡수한다
// (목록 응답이 명세와 어긋났던 전례 — FolderService·NoticeService 주석 참고).
interface RawOrgAccount {
  loginId: string;
  alias: string | null;
  status: OrgAccount['status'];
  role: string;
  lastLoginAt: string | null;
  usedCredits?: number | null;
  monthCredits?: number | null; // 구 명세
  isSelf?: boolean;
  self?: boolean; // 구 명세
}

interface RawOrgAccountList {
  usageSince?: string | null;
  month?: string | null; // 구 명세
  items?: RawOrgAccount[] | null;
}

export const normalizeOrgAccounts = (
  raw: RawOrgAccountList | RawOrgAccount[] | null,
): OrgAccountList => {
  const list: RawOrgAccountList = Array.isArray(raw)
    ? { items: raw }
    : (raw ?? {});
  return {
    usageSince: list.usageSince ?? null,
    items: (list.items ?? []).map((a) => ({
      loginId: a.loginId,
      alias: a.alias ?? null,
      status: a.status,
      role: a.role,
      lastLoginAt: a.lastLoginAt ?? null,
      usedCredits: a.usedCredits ?? a.monthCredits ?? 0,
      isSelf: a.isSelf ?? a.self ?? false,
    })),
  };
};

export const listOrgAccounts = async (token: string): Promise<OrgAccountList> =>
  normalizeOrgAccounts(
    await apiRequest<RawOrgAccountList | RawOrgAccount[] | null>(
      '/api/org/accounts',
      { token },
    ),
  );

// PATCH /api/org/accounts/{loginId}/alias — 빈 값이면 별칭 제거.
// 실명 대신 역할명을 권장한다(기획 명시). 50자 초과는 COMMON4000.
export const updateAccountAlias = (
  loginId: string,
  alias: string,
  token: string,
): Promise<null> =>
  apiRequest<null>(`/api/org/accounts/${encodeURIComponent(loginId)}/alias`, {
    method: 'PATCH',
    body: { alias: alias.trim() || null },
    token,
  });

// PATCH /api/org/accounts/{loginId}/lock — 즉시 반영(담당자 교체·퇴사 처리).
// 본인 계정은 잠글 수 없다(COMMON4000).
export const setAccountLock = (
  loginId: string,
  locked: boolean,
  token: string,
): Promise<OrgLockResult> =>
  apiRequest<OrgLockResult>(
    `/api/org/accounts/${encodeURIComponent(loginId)}/lock`,
    { method: 'PATCH', body: { locked }, token },
  );

// GET /api/org/accounts/{loginId}/jobs?from&to — 기간 미지정 시 최근 30일.
// 작업 요청 시각(startedAt) 기준, 휴지통 제외.
export const listOrgAccountJobs = (
  loginId: string,
  token: string,
  range: { from?: string; to?: string } = {},
): Promise<OrgAccountJobs> =>
  apiRequest<OrgAccountJobs>(
    `/api/org/accounts/${encodeURIComponent(loginId)}/jobs${query(range)}`,
    { token },
  );

// GET /api/org/orders — 주문 내역 + 증빙 받는 사람.
export const listOrgOrders = (token: string): Promise<OrgOrders> =>
  apiRequest<OrgOrders>('/api/org/orders', { token });

// PATCH /api/org/receipt-email — 빈 값이면 증빙 수신자 제거.
export const updateReceiptEmail = (
  email: string,
  token: string,
): Promise<null> =>
  apiRequest<null>('/api/org/receipt-email', {
    method: 'PATCH',
    body: { email: email.trim() || null },
    token,
  });

// GET /api/org/orders/{orderId}/receipt — presigned URL(15분)을 받아 그대로 내려받는다.
// URL은 오래 캐시하면 안 되므로 누를 때마다 새로 받는다.
export const getOrderReceipt = (
  orderId: string,
  token: string,
): Promise<OrgReceiptLink> =>
  apiRequest<OrgReceiptLink>(
    `/api/org/orders/${encodeURIComponent(orderId)}/receipt`,
    { token },
  );

// presigned URL은 인증 헤더 없이 그대로 받는다(헤더를 붙이면 서명 검증에 걸린다).
export const fetchReceiptBlob = async (url: string): Promise<Blob> => {
  const res = await httpFetch(url);
  if (!res.ok) throw new Error('증빙 파일을 내려받지 못했습니다.');
  return res.blob();
};

// GET /api/org/notices — 노출 기간 내 공지만. 본문(body)이 함께 온다.
export const listOrgNotices = (token: string): Promise<OrgNotice[]> =>
  apiRequest<OrgNotice[]>('/api/org/notices', { token });

// GET /api/org/requests — 우리 기관 요청 + 처리 상태(최신순).
export const listOrgRequests = (token: string): Promise<OrgRequest[]> =>
  apiRequest<OrgRequest[]>('/api/org/requests', { token });

// POST /api/org/requests — 운영자 문의 목록으로 들어간다.
// type은 CREDIT_ADD | ACCOUNT_ISSUE만 허용(그 외 COMMON4000).
export const createOrgRequest = (
  type: OrgRequestType,
  message: string,
  token: string,
): Promise<OrgRequest> =>
  apiRequest<OrgRequest>('/api/org/requests', {
    method: 'POST',
    body: { type, message: message.trim() || null },
    token,
  });

// DELETE /api/org/requests/{requestId} — OPEN 상태에서만(접수 전 회수).
// 이미 처리 중이면 COMMON4000이 온다.
export const cancelOrgRequest = (
  requestId: string,
  token: string,
): Promise<null> =>
  apiRequest<null>(`/api/org/requests/${encodeURIComponent(requestId)}`, {
    method: 'DELETE',
    token,
  });
