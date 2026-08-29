// 모드(탭)별 허용 파일 검증.
// 명세: a(초안 생성)=PDF, b(텍스트 점자 번역)=TXT/HWP, c(이미지 점자 번역)=PDF
import { ConversionTab, FileType, TAB_LABEL, TABS } from '../types';

export const detectFileType = (file: File): FileType => {
  if (file.type.includes('pdf')) return 'pdf';
  if (file.type.includes('image')) return 'image';
  const name = file.name.toLowerCase();
  if (name.endsWith('.hwpx')) return 'hwpx';
  if (name.endsWith('.hwp')) return 'hwp';
  return 'text';
};

// HWP는 초안 생성(a)에서 받는다 — 서버가 PDF로 바꿔 처리한다(2026-08-26 변경).
// 텍스트 점자 번역(b)은 더 이상 HWP를 받지 않는다.
// 텍스트 점자 번역(b)의 HWP·HWPX는 **FE가 읽어 텍스트로 바꿔** 올린다
// (`shared/HwpParser`). 서버 계약은 그대로 .txt다 — 1차 PoC 3-1 요청 중 FE만으로
// 되는 절반이다. 초안 생성(a)·이미지 점자 번역(c)은 문서를 그대로 봐야 해서
// 서버 변환이 필요하다(docs/SERVER-REQUIREMENTS-3.3.0.md S-5).
export const TAB_ALLOWED_FILE_TYPES: Record<ConversionTab, FileType[]> = {
  [TABS.OCR]: ['pdf', 'hwp'],
  [TABS.BRAILLE]: ['text', 'hwp', 'hwpx'],
  [TABS.INTEGRATED]: ['pdf'],
};

/** FE가 텍스트로 바꿔서 올려야 하는 형식인지. */
export const needsLocalTextExtraction = (type: FileType): boolean =>
  type === 'hwp' || type === 'hwpx';

// 에러 메시지/안내에 쓰는 사람이 읽을 수 있는 허용 형식 라벨
export const TAB_ALLOWED_FILE_LABEL: Record<ConversionTab, string> = {
  [TABS.OCR]: 'PDF, HWP',
  [TABS.BRAILLE]: 'TXT, HWP, HWPX',
  [TABS.INTEGRATED]: 'PDF',
};

export const isFileAllowedForTab = (file: File, tab: ConversionTab): boolean =>
  TAB_ALLOWED_FILE_TYPES[tab].includes(detectFileType(file));

export const fileValidationMessage = (tab: ConversionTab): string =>
  `${TAB_LABEL[tab]} 모드는 ${TAB_ALLOWED_FILE_LABEL[tab]} 파일만 지원합니다.`;

// 업로드 상한은 파일 1개당 100MB. 다만 BE 상한과 앞단 프록시(Cloudflare) 상한이
// 겹쳐 경계가 애매하므로, 명세 권고대로 FE 임계값은 95MB로 잡는다.
export const MAX_UPLOAD_BYTES = 95 * 1024 * 1024;

// 화면에 적는 상한 문구는 임계값에서 뽑는다. 드롭존에는 "최대 100MB", 초과 안내에는
// "95MB까지"라고 서로 다르게 적혀 있어, 97MB 파일을 올린 사람은 안내끼리 어긋나는
// 것을 보게 됐다(2026-08-27 인수시험). 한 곳에서 만들어 두 자리가 같이 움직이게 한다.
export const MAX_UPLOAD_LABEL = `${Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)}MB`;

// 실제 임계값(95MiB)을 그대로 알린다. "100MB까지"라고만 적어 두면 97MB 파일이 왜
// 막히는지 알 수 없다(2026-08-26 통합시험).
export const fileSizeMessage = (file: File): string | null =>
  file.size > MAX_UPLOAD_BYTES
    ? `업로드할 수 있는 파일 크기는 ${MAX_UPLOAD_LABEL}까지입니다. (넣으신 파일 ${Math.round(
        file.size / 1024 / 1024,
      )}MB)`
    : null;

// 꼬리말(묵자)은 Job 생성 multipart의 선택 항목. 200자를 넘기면 서버가 COMMON4000을
// 주는데, 그 문구("잘못된 요청입니다")로는 원인을 알 수 없어 FE에서 먼저 거른다.
export const FOOTER_TEXT_MAX_LENGTH = 200;

export const footerTextMessage = (footerText: string): string | null =>
  footerText.trim().length > FOOTER_TEXT_MAX_LENGTH
    ? `꼬리말은 ${FOOTER_TEXT_MAX_LENGTH}자까지 입력할 수 있습니다.`
    : null;
