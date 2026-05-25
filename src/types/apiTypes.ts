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
  section: string;
  title: string;
  excerpt: string;
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

// mode a: text_list 항목 (AI가 여러 후보를 제안 → contents는 배열)
export interface OcrTextItem {
  id: number | string;
  type: string;
  order: number;
  is_blocked: boolean;
  contents: string[];
  rule_trail?: RuleTrail[];
}

// mode b: text_list 항목 (원본 텍스트, 단일 content)
export interface PlainTextItem {
  id: number | string;
  content: string;
}

// mode b / c: braille_text_list 항목 (점자 결과, content는 배열)
export interface BrailleTextItem {
  id: number | string;
  type: string;
  is_blocked: boolean;
  content: string[];
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
