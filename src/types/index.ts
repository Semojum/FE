export type ConversionTab = 'OCR 변환' | '점역 변환' | '통합 변환';

export type FileType = 'image' | 'pdf' | 'text' | 'hwp'; // 확장

export interface FileState {
  file: File | null;
  previewUrl: string | null;
  fileType: FileType | null;
  currentPage: number;
  totalPages: number;
}

export interface ConversionResult {
  status: 'idle' | 'processing' | 'success' | 'error';
  text: string | null;
  error: string | null;
}

export interface FileState {
  file: File | null;
  previewUrl: string | null;
  fileType: FileType | null;
  textContent?: string; // .txt 파일의 내용을 담을 필드 추가
  currentPage: number;
  totalPages: number;
}