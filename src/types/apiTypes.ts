// src/types/apiTypes.ts
// BE API 명세서(https://api.semojum.app)에 맞춘 Job / SSE 타입 정의.

export type JobMode = 'a' | 'b' | 'c';
// a: 이미지 → 텍스트 (PDF)
// b: 텍스트 → 점자 (TXT, HWP)
// c: 이미지 → 점자 (PDF)

// POST /api/jobs 응답 (result)
export interface CreateJobResponse {
  jobId: string;
  mode: JobMode;
  totalPages: number;
  status: string; // PENDING ...
  // 업로드 시 선택한 쪽번호 삽입 여부를 서버가 기록해 되돌려준다.
  insertPageNumber?: boolean;
  // 업로드 시 입력한 꼬리말(묵자). 미입력이면 null. 다운로드(.brf) 때 점역되어
  // 페이지행 가운데에 들어간다 — 화면 격자에는 그리지 않는다.
  footerText?: string | null;
}

export interface ApiError {
  message: string;
  code?: string;
}

// ---- GET /api/jobs/{jobId}/status ----

export type PageStatus =
  | 'PENDING'
  | 'RUNNING'
  | 'COMPLETED'
  | 'NEEDS_REVIEW'
  | 'BLOCKED';

export type OverallStatus = 'PENDING' | 'IN_PROGRESS' | 'COMPLETED';

export interface JobStatusResponse {
  jobId: string;
  totalPages: number;
  completedPages: number;
  pendingPages: number;
  runningPages: number;
  overallStatus: OverallStatus;
  pages: Record<string, PageStatus>; // { "page:1": "COMPLETED", ... }
}

// ---- SSE 공통 구조 ----

// 각 변환 요소에 적용된 점역 규정 목록
export interface RuleTrail {
  rule_id: string; // 예: §2.2
  source?: string; // 규정 출처 문서 (예: 한국점자규정)
  section: string;
  title: string;
  excerpt: string;
  priority?: 'primary' | 'secondary'; // primary=주 적용 / secondary=보조 참고
  line_no?: number; // 적용된 줄 번호(0-based). -1이면 요소 전체
  col_start?: number; // 해당 줄 내 시작 칸(0-based)
  col_end?: number; // 해당 줄 내 끝 칸(미포함)
  tag?: string; // 변환 종류 (number_sign, contraction, line_wrap 등)
}

export interface QualityReport {
  ocr_confidence_avg: number;
  line_overflow_rate: number;
  critical_errors: string[];
  review_flags: string[];
}

export interface BoundingBoxDto {
  id: number | string;
  x: number;
  y: number;
  x2: number;
  y2: number;
}

// drafts 항목: 시각 요소(표·차트·이미지·만화)의 대체 초안.
// 점역사가 피커(대체 텍스트 추천)에서 고를 후보. 텍스트·수식은 빈 배열.
export interface Draft {
  text?: string; // 점역사주 원문(한글) — 어떤 방식인지 설명
  contents: string[]; // 이 초안의 결과 줄 목록(점자/텍스트). 선택 시 본문이 됨
  label?: string; // 피커 표시용 방식명 (예: "격자형", "행↔열 전치")
}

// mode a: text_list 항목.
// contents는 "최종 결과 줄 목록"(후보가 아님). 대체 후보는 drafts에 들어온다.
export interface OcrTextItem {
  id: number | string;
  type: string;
  order: number;
  is_blocked: boolean;
  tn_text?: string | null; // AI가 생성한 점역사주 원문(한글) — 시각 요소 설명
  contents: string[];
  selected_idx?: number;
  // 명세는 Draft[]지만 실서버가 JSON 문자열로 이중 인코딩해 보내는 경우가 있다
  drafts?: Draft[] | string | null;
  rule_trail?: RuleTrail[];
}

// mode b: text_list 항목 (원본 텍스트). 명세상 id + contents(줄 목록)만 내려온다.
export interface PlainTextItem {
  id: number | string;
  contents?: string[];
  content?: string; // 구버전 호환
}

// mode b / c: braille_text_list 항목 (점자 결과).
// contents는 결과 줄 목록, drafts는 대체 초안 후보.
export interface BrailleTextItem {
  id: number | string;
  type: string;
  is_blocked: boolean;
  tn_text?: string | null; // AI가 생성한 점역사주 원문(한글) — 시각 요소 설명
  contents: string[];
  selected_idx?: number;
  // 명세는 Draft[]지만 실서버가 JSON 문자열로 이중 인코딩해 보내는 경우가 있다
  drafts?: Draft[] | string | null;
  rule_trail?: RuleTrail[];
}

export type PageEventStatus = 'COMPLETED' | 'NEEDS_REVIEW' | 'BLOCKED';

// SSE result 본문 (모드별로 채워지는 필드가 다름)
export interface StreamPageResult {
  image_resolution?: { width: number; height: number };
  bounding_box_list?: BoundingBoxDto[];
  // mode a: OcrTextItem[], mode b: PlainTextItem[]
  text_list?: Array<OcrTextItem | PlainTextItem>;
  braille_text_list?: BrailleTextItem[];
  quality_report?: QualityReport;
}

// event: page_done
export interface StreamPageData {
  type?: 'page_done';
  job_id: string;
  page_no: number;
  status?: PageEventStatus;
  result: StreamPageResult;
  /**
   * **이미 점역된** 꼬리말(2026-09-03 서버 반영 · 요청서 S-4). 업로드 때 받은 묵자
   * 꼬리말을 서버가 점역해 매 page_done에 같은 값으로 실어 준다. FE에는 점역기가
   * 없으므로 판면 페이지행의 꼬리말 자리는 이 값으로만 채울 수 있다.
   * 페이지 조회(GET)에서는 같은 값이 `footerBraille`(캐멀)로 온다.
   */
  footer_braille?: string | null;
}

// event: job_done
export interface JobDoneData {
  type?: 'job_done';
  job_id: string;
  total_pages: number;
  failed_pages: number[];
}

// event: queue_position
export interface QueuePositionData {
  type?: 'queue_position';
  position: number;
  estimated_wait_sec: number;
}

export interface StreamError {
  message: string;
}
