// src/types/apiTypes.ts

export type JobMode = 'a' | 'b' | 'c'; // a: 점역(Braille), c: OCR

export interface StartJobResponse {
  job_id: string;
  status: string; // "PROCESSING"
  message: string;
  mode: JobMode;
}

export interface ApiError {
  message: string;
  code?: string;
}

export interface StartJobResponse {
  job_id: string;
  status: string;
  message: string;
  mode: 'a' | 'b' | 'c';
}

// [New] SSE로 들어오는 페이지 데이터 타입
export interface StreamPageData {
  job_id: string;
  page_number: number;

  // OCR 모드일 때 주로 사용 (Optional)
  image_resolution?: { width: number; height: number };
  bounding_box_list?: Array<{
    id: number | string;
    x: number;
    y: number;
    x2: number;
    y2: number;
  }>;

  // 공통 사용 (원본 텍스트)
  text_list: Array<{
    id: number | string;
    content: string;
    order?: number; // OCR일 땐 order가 있고, 점역일 땐 없을 수도 있음
  }>;

  // ✅ [New] 점역 모드일 때만 들어오는 데이터
  braille_text_list?: Array<{
    id: number | string;
    brf_id: number;
    content: string; // 점자 텍스트 (ASCII or Unicode)
  }>;
}

export interface StreamError {
  message: string;
}
