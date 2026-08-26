import type { RuleTrail } from './apiTypes';

export type { RuleTrail };

// 탭 식별자는 서버 mode(a/b/c)와 같은 값을 쓴다. 예전에는 화면에 보이는 이름
// ('OCR 변환' 등)이 곧 식별자여서 탭 스냅샷 키·모드 분기가 전부 그 문자열에 묶여
// 있었고, 그래서 이름을 못 바꿨다. 라벨은 TAB_LABEL로 분리한다.
export const TABS = {
  OCR: 'a',
  BRAILLE: 'b',
  INTEGRATED: 'c',
} as const;

export const TAB_VALUES = [TABS.OCR, TABS.BRAILLE, TABS.INTEGRATED] as const;

export type ConversionTab = (typeof TAB_VALUES)[number];

// 화면에 보이는 모드 이름. 마이페이지 카드 배지(Cards.tsx MODE_META)와 같은 문구다.
export const TAB_LABEL: Record<ConversionTab, string> = {
  [TABS.OCR]: '초안 생성',
  [TABS.BRAILLE]: '텍스트 점자 번역',
  [TABS.INTEGRATED]: '이미지 점자 번역',
};

export type FileType = 'image' | 'pdf' | 'text' | 'hwp'; // 확장

export interface FileState {
  file: File | null;
  previewUrl: string | null;
  fileType: FileType | null;
  textContent?: string; // .txt / .hwp 파일의 텍스트 내용
  currentPage: number;
  totalPages: number;
  error?: string | null; // 모드별 허용 파일 검증 실패 메시지
  // 마이페이지에서 불러온 작업의 원본은 페이지별로 분리된 단일 페이지 PDF/이미지다.
  // true면 미리보기를 (currentPage가 아닌) 1페이지로 렌더하고, 총 페이지 수를
  // 이 미리보기의 onLoadSuccess로 덮어쓰지 않는다.
  isRestoredPages?: boolean;
  // 지금 previewUrl이 몇 쪽의 원본인지(복원본 전용). 쪽을 넘기면 currentPage는
  // 바로 바뀌지만 원본은 내려받은 뒤에야 도착한다 — 그 사이를 미리보기가
  // "이전 쪽을 흐리게 + 불러오는 중"으로 표시하는 데 쓴다.
  previewPage?: number;
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

// 대체 초안(명세 drafts) 한 건 — 피커에서 방식(탭)별로 하나씩 크게 보여 준다.
// 기획 정본(모눈종이 뷰 §3 서버 계약): "drafts[i] = 라벨·묵자 원문, 점자는 contents[i]".
export interface BlockDraft {
  label?: string; // 방식명 = 탭 이름 (예: "격자형", "행↔열 전치")
  printText?: string; // 묵자 원문(한글) — 점자 안과 짝을 이루는, 사람이 읽는 글
  content: string; // 적용될 본문. b·c = 점자 줄 목록(\n), a = 묵자 그대로
}

// 기존 TranslationBlock 확장
export interface TranslationBlock {
  id: string;
  originalText?: string;
  currentText: string;
  candidates: string[];
  bbox?: BoundingBox; // bbox 정보 추가
  isBlocked?: boolean; // 명세 is_blocked: 처리 불가/검토 필요 요소
  // 명세 type: 'text' | 'formula' | … — 독립 수식 요소는 구분자($·```) 없이
  // 순수 LaTeX로 오기도 한다(2026-08-24 실측). 표기로만 판단하면 놓친다.
  isFormula?: boolean;
  ruleTrail?: RuleTrail[]; // 명세 rule_trail: 적용된 점역 규정
  tnText?: string; // 명세 tn_text: AI 점역사주 원문(시각 요소 설명)
  drafts?: BlockDraft[]; // 명세 drafts: 대체 초안(라벨/설명 포함)
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
