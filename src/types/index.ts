export type ConversionTab =
  | 'OCR 변환'
  | '교정 변환'
  | '점역 변환'
  | '통합 변환';

export type FileType = 'image' | 'pdf' | 'text' | 'hwp'; // 확장

export interface FileState {
  file: File | null;
  previewUrl: string | null;
  fileType: FileType | null;
  currentPage: number;
  totalPages: number;
}

export interface FileState {
  file: File | null;
  previewUrl: string | null;
  fileType: FileType | null;
  textContent?: string; // .txt 파일의 내용을 담을 필드 추가
  currentPage: number;
  totalPages: number;
}

export interface PaginationProps {
  currentPage: number; // 현재 페이지 (1-based index)
  totalPages: number; // 전체 페이지 수
  onPageChange: (page: number) => void; // 페이지 변경 핸들러
  limit?: number; // 한 번에 보여줄 페이지 버튼의 개수 (Default: 10)
}

export interface BoundingBox {
  id: string;
  x: number;
  y: number;
  x2: number;
  y2: number;
}

export interface ImageResolution {
  width: number;
  height: number;
}

// 서버 응답 데이터 타입
export interface OCRResponse {
  job_id: string;
  page_number: number;
  image_resolution: ImageResolution;
  bounding_box_list: BoundingBox[];
  text_list: { id: string; order: number; contents: string }[];
}

// 기존 TranslationBlock 확장
export interface TranslationBlock {
  id: string;
  originalText?: string;
  currentText: string;
  candidates: string[];
  bbox?: BoundingBox; // bbox 정보 추가
}

export interface OriginalTextBlock {
  id: string;
  content: string;
}

// [New] 교정 변환 서버 응답 타입
export interface ProofreadingResponse {
  job_id: string;
  page_number: number;
  text_list: OriginalTextBlock[]; // 원본 텍스트 (입력창용)
  optimized_text_list: {
    id: string;
    order: number;
    contents: string[] | string; // JSON 예시의 {...}를 배열이나 문자열로 처리
    legend?: string;
  }[]; // 변환된 텍스트 (에디터용)
}

export interface BrailleTranslationResponse {
  job_id: string;
  page_number: number;
  text_list: {
    id: string;
    contents: string; // 주의: 교정 변환은 content였지만, 여기서는 contents입니다.
  }[];
  braille_text_list: {
    id: string;
    order: number;
    content: string;
  }[];
}