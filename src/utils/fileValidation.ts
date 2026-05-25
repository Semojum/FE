// 모드(탭)별 허용 파일 검증.
// 명세: a(OCR 변환)=PDF, b(점역 변환)=TXT/HWP, c(통합 변환)=PDF
import { ConversionTab, FileType, TABS } from '../types';

export const detectFileType = (file: File): FileType => {
  if (file.type.includes('pdf')) return 'pdf';
  if (file.type.includes('image')) return 'image';
  if (file.name.toLowerCase().endsWith('.hwp')) return 'hwp';
  return 'text';
};

export const TAB_ALLOWED_FILE_TYPES: Record<ConversionTab, FileType[]> = {
  [TABS.OCR]: ['pdf'],
  [TABS.BRAILLE]: ['text', 'hwp'],
  [TABS.INTEGRATED]: ['pdf'],
};

// 에러 메시지/안내에 쓰는 사람이 읽을 수 있는 허용 형식 라벨
export const TAB_ALLOWED_FILE_LABEL: Record<ConversionTab, string> = {
  [TABS.OCR]: 'PDF',
  [TABS.BRAILLE]: 'TXT, HWP',
  [TABS.INTEGRATED]: 'PDF',
};

export const isFileAllowedForTab = (
  file: File,
  tab: ConversionTab,
): boolean => TAB_ALLOWED_FILE_TYPES[tab].includes(detectFileType(file));

export const fileValidationMessage = (tab: ConversionTab): string =>
  `${tab} 모드는 ${TAB_ALLOWED_FILE_LABEL[tab]} 파일만 지원합니다.`;
