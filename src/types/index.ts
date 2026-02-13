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

export interface TranslationBlock {
  id: string;
  originalText?: string;
  currentText: string; // 화면에 표시되고 수정 가능한 텍스트
  candidates: string[]; // 대체 가능한 번역 후보군 리스트 (예: ["안녕", "안녕하세요", "반가워요"])
}

export interface PaginationProps {
  currentPage: number; // 현재 페이지 (1-based index)
  totalPages: number; // 전체 페이지 수
  onPageChange: (page: number) => void; // 페이지 변경 핸들러
  limit?: number; // 한 번에 보여줄 페이지 버튼의 개수 (Default: 10)
}