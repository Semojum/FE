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

export const isFileAllowedForTab = (file: File, tab: ConversionTab): boolean =>
  TAB_ALLOWED_FILE_TYPES[tab].includes(detectFileType(file));

export const fileValidationMessage = (tab: ConversionTab): string =>
  `${tab} 모드는 ${TAB_ALLOWED_FILE_LABEL[tab]} 파일만 지원합니다.`;

// 업로드 상한은 파일 1개당 100MB. 다만 BE 상한과 앞단 프록시(Cloudflare) 상한이
// 겹쳐 경계가 애매하므로, 명세 권고대로 FE 임계값은 95MB로 잡는다.
export const MAX_UPLOAD_BYTES = 95 * 1024 * 1024;

export const fileSizeMessage = (file: File): string | null =>
  file.size > MAX_UPLOAD_BYTES
    ? '업로드할 수 있는 파일 크기는 100MB까지입니다.'
    : null;

// 꼬리말(묵자)은 Job 생성 multipart의 선택 항목. 200자를 넘기면 서버가 COMMON4000을
// 주는데, 그 문구("잘못된 요청입니다")로는 원인을 알 수 없어 FE에서 먼저 거른다.
export const FOOTER_TEXT_MAX_LENGTH = 200;

export const footerTextMessage = (footerText: string): string | null =>
  footerText.trim().length > FOOTER_TEXT_MAX_LENGTH
    ? `꼬리말은 ${FOOTER_TEXT_MAX_LENGTH}자까지 입력할 수 있습니다.`
    : null;
