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
  image_resolution: {
    width: number;
    height: number;
  };
  bounding_box_list: Array<{
    id: number | string;
    x: number;
    y: number;
    x2: number;
    y2: number;
  }>;
  text_list: Array<{
    id: number | string;
    order: number;
    content: string;
  }>;
}

export interface StreamError {
  message: string;
}
