export type ConversionTab = 'OCR 변환' | '점역 변환' | '통합 변환';

export type FileType = 'image' | 'pdf';

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
