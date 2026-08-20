// [V3] API 명세서 — 기관(Org) · 사용량(Usage) 응답 타입.
// 화면은 Figma V3-06 (기관 관리 T2 · 계정 상세 T2-2 · 사용량 T3).
//
// 열람 범위(기획 확정):
//  - 기관 담당자는 소속 계정의 작업 "목록·상태·크레딧"까지만 본다. 파일 내용과
//    접속 정보는 내려오지 않는다.
//  - 일반 계정은 자기 사용량과 기관 전체·잔여만 본다. 다른 계정이 각각 얼마를
//    썼는지는 보이지 않는다.

import { JobMode } from './apiTypes';
import { JobStatus } from './mypage';

// ─── 기관 대시보드 (GET /api/org/dashboard) ──────────────────────────

// 서버가 쓰는 값은 명세에 열거돼 있지 않다 — 실서버는 'BASIC'을 준다(2026-08-20 실측).
// 모르는 값이 와도 화면은 코드 그대로 보여 주므로 유니온을 열어 둔다.
export type ContractType =
  | 'BASIC'
  | 'PAID'
  | 'TRIAL'
  | 'INTERNAL'
  | (string & {});

export const CONTRACT_TYPE_LABEL: Record<string, string> = {
  BASIC: '기본',
  PAID: '유료',
  TRIAL: '체험',
  INTERNAL: '내부',
};

// 최근 6개월(이번 달 포함, KST). 빈 달은 credits 0으로 채워져 온다.
export interface MonthlyUsagePoint {
  month: string; // 'YYYY-MM'
  credits: number;
}

export interface OrgDashboard {
  orgName: string;
  orgCode: string;
  contractType: ContractType;
  contractStartedAt: string; // 'YYYY-MM-DD'
  contractExpiresAt: string;
  creditAllocated: number;
  creditUsed: number;
  // 할당 − 사용. 초과 사용 시 음수가 그대로 온다(표시 판단은 FE 몫).
  creditRemaining: number;
  monthlyUsage: MonthlyUsagePoint[];
}

// ─── 소속 계정 (GET /api/org/accounts) ───────────────────────────────

export type OrgAccountStatus = 'ACTIVE' | 'INACTIVE';

export interface OrgAccount {
  loginId: string;
  alias: string | null;
  status: OrgAccountStatus; // INACTIVE = 잠김
  role: string; // 'ROLE_USER' | 'ROLE_ORG_ADMIN'
  lastLoginAt: string | null;
  // 계약 시작일 이후 "누적" 사용 크레딧. 월 단위가 아니다(기획 정정 2026-08-20).
  usedCredits: number;
  isSelf: boolean; // 본인 행은 잠글 수 없다
}

export interface OrgAccountList {
  usageSince: string | null; // 누적 집계 시작일(=계약 시작일) 'YYYY-MM-DD'
  items: OrgAccount[];
}

// PATCH /api/org/accounts/{loginId}/lock 응답
export interface OrgLockResult {
  loginId: string;
  status: OrgAccountStatus;
  // 잠글 때 중단된 변환 수 (해제 시 0)
  canceledJobs: number;
}

// ─── 계정 상세의 작업 목록 (GET /api/org/accounts/{loginId}/jobs) ────

export interface OrgAccountJob {
  jobId: string;
  fileName: string;
  mode: JobMode;
  status: JobStatus;
  totalPages: number;
  // 변환 중일 때만 — "진행 중 n/m쪽" 표기용 (Redis 장애 시 null)
  donePages: number | null;
  // 종료된 작업만 — 전부 성공이면 null
  failedPages: number | null;
  // 진행 중이면 null (끝나야 확정)
  credits: number | null;
  startedAt: string;
  finishedAt: string | null;
}

export interface OrgAccountJobs {
  loginId: string;
  alias: string | null;
  from: string; // 'YYYY-MM-DD'
  to: string;
  items: OrgAccountJob[];
  totalPages: number;
  totalCredits: number;
}

// ─── 주문 내역 (GET /api/org/orders) ─────────────────────────────────

export type InvoiceStatus = 'PENDING' | 'ISSUED';

export const INVOICE_STATUS_LABEL: Record<InvoiceStatus, string> = {
  PENDING: '발행 대기',
  ISSUED: '발행 완료',
};

export interface OrgOrder {
  id: string;
  orderDate: string; // 'YYYY-MM-DD'
  description: string;
  amountKrw: number;
  creditAmount: number;
  // null이면 미납, 값이 있으면 완납
  paidAt: string | null;
  invoiceStatus: InvoiceStatus;
  // null이면 증빙 미첨부 → 내려받기 버튼을 숨긴다
  receiptFileName: string | null;
}

export interface OrgOrders {
  receiptEmail: string | null;
  items: OrgOrder[];
}

// GET /api/org/orders/{orderId}/receipt — presigned 15분. URL을 캐시하지 않는다.
export interface OrgReceiptLink {
  fileName: string;
  url: string;
}

// ─── 공지 (GET /api/org/notices) ─────────────────────────────────────

export type NoticeScope = 'ALL' | 'ORG';

export const NOTICE_SCOPE_LABEL: Record<NoticeScope, string> = {
  ALL: '전체',
  ORG: '우리 기관',
};

export interface OrgNotice {
  id: string;
  scope: NoticeScope;
  title: string;
  // 본문이 목록 항목에 함께 온다 — 제목을 눌러도 추가 조회가 없다.
  body: string;
  startsOn: string;
  endsOn: string;
  createdAt: string;
}

// ─── 요청 (POST·GET·DELETE /api/org/requests) ────────────────────────

export type OrgRequestType = 'CREDIT_ADD' | 'ACCOUNT_ISSUE';

export const ORG_REQUEST_TYPE_LABEL: Record<OrgRequestType, string> = {
  CREDIT_ADD: '크레딧 추가',
  ACCOUNT_ISSUE: '계정 발급',
};

export type OrgRequestStatus = 'OPEN' | 'IN_REVIEW' | 'ANSWERED';

export const ORG_REQUEST_STATUS_LABEL: Record<OrgRequestStatus, string> = {
  OPEN: '미답변',
  IN_REVIEW: '확인 중',
  ANSWERED: '답변 완료',
};

export interface OrgRequest {
  id: string;
  type: OrgRequestType;
  status: OrgRequestStatus;
  message: string | null;
  // ⚠️ 접수 직후 응답에서는 null일 수 있다 — 목록을 다시 부르면 채워진다.
  createdAt: string | null;
}

// 취소(DELETE)는 OPEN 상태에서만 가능하다. 그 뒤로는 운영자가 이미 보고 있다.
export const isCancelableRequest = (r: OrgRequest): boolean =>
  r.status === 'OPEN';

export const ORG_REQUEST_MESSAGE_MAX_LENGTH = 1000;
export const ORG_ALIAS_MAX_LENGTH = 50;

// ─── 사용량 (GET /api/users/usage · /api/users/usage/jobs) ───────────

export interface UsageSummary {
  month: string; // 'YYYY-MM'
  myCredits: number;
  // 무소속 계정은 기관 값이 전부 null이다.
  orgAllocated: number | null;
  orgUsed: number | null;
  orgRemaining: number | null;
}

export interface UsageJob {
  jobId: string;
  fileName: string;
  mode: JobMode;
  status: JobStatus;
  totalPages: number;
  donePages: number | null;
  failedPages: number | null;
  credits: number | null;
  finishedAt: string | null;
}

export interface UsageJobs {
  from: string;
  to: string;
  items: UsageJob[];
  totalCredits: number;
}

// ─── 로그인 화면 공지 (GET /api/public/notices) ──────────────────────
//
// 2026-08-20 실측: 서버가 이 경로를 열었다(08-19에는 404 COMMON4004였다).
//   GET /api/public/notices  · 인증 불필요 · 노출 기간(KST 오늘) 안의 scope=ALL 공지만
//   result: [{ id, title, body, startsOn, endsOn, createdAt }]
export interface PublicNotice {
  id: string;
  title: string;
  body: string;
  startsOn: string;
  endsOn: string;
  createdAt?: string | null;
}
