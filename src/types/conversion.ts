export type ConversionTab = 'OCR 변환' | '점역 변환' | '통합 변환';

export interface FileWithPreview extends File {
  preview?: string;
}

export interface ConversionState {
  file: FileWithPreview | null;
  status: 'idle' | 'uploading' | 'success' | 'error';
  resultText: string | null;
  error: string | null;
}
export interface FileState {
  file: File | null;
  previewUrl: string | null;
  fileType: 'image' | 'pdf' | null;
  currentPage: number;
  totalPages: number;
}