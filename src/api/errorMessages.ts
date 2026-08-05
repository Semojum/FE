import { ApiError } from './apiClient';

// [V3] API 명세서 "공통 에러 코드" — 서버 message를 그대로 노출하면 맥락이 없는
// 경우가 있어(특히 V3 신규 코드) 화면에서 바로 읽히는 문구로 옮긴다.
// 여기 없는 코드는 서버 message를 그대로 쓴다.
const MESSAGES: Record<string, string> = {
  // 공통
  COMMON4000: '잘못된 요청입니다.',
  COMMON4001: '로그인이 필요합니다.',
  COMMON4003: '권한이 없습니다.',
  COMMON4004: '요청한 경로를 찾을 수 없습니다.',
  COMMON4005: '지원하지 않는 요청입니다.',
  COMMON5000: '서버 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.',

  // 인증
  AUTH4001: '아이디 또는 비밀번호가 올바르지 않습니다.',
  AUTH4002: '이미 사용 중인 아이디입니다.',
  AUTH4003: '로그인이 만료되었습니다. 다시 로그인해 주세요.',
  AUTH4004: '비활성화된 계정입니다. 기관 담당자에게 문의해 주세요.',
  USER4001: '존재하지 않는 계정입니다.',

  // 작업
  JOB4001: '존재하지 않는 작업입니다.',
  JOB4002: '이 모드에서 지원하지 않는 파일 형식입니다.',
  JOB4003: '지원하지 않는 변환 모드입니다.',
  JOB4004: '존재하지 않는 요소입니다.',
  JOB4005: '잘못된 요소 타입입니다.',
  JOB4006:
    '블록 순서가 현재 페이지와 맞지 않습니다. 새로고침 후 다시 시도해 주세요.',
  JOB4007:
    'HWP 파일을 읽지 못했습니다. 한글에서 "한글 문서(.hwp)"로 다시 저장해 주세요. (HWPX 형식은 아직 지원하지 않습니다)',
  JOB4008:
    '암호가 설정되었거나 배포용으로 저장된 HWP 파일은 변환할 수 없습니다.',
  JOB4009: '업로드 파일이 100MB를 초과했습니다.',
  JOB4010:
    '변환 중인 작업에는 이 동작을 할 수 없습니다. 완료 후 다시 시도해 주세요.',
  JOB4011: '이미 점역으로 보낸 문서가 있습니다.',

  // 폴더
  FOLDER4001: '존재하지 않는 폴더입니다.',
  FOLDER4002: '같은 위치에 같은 이름의 폴더가 이미 있습니다.',
  FOLDER4003: '폴더는 5단계까지만 만들 수 있습니다.',
  FOLDER4004: '폴더는 계정당 200개까지만 만들 수 있습니다.',

  // 기관 (운영자 API)
  ORG4001: '존재하지 않는 기관입니다.',
  ORG4002: '이미 사용 중인 기관 코드입니다.',
};

// 예외를 화면에 띄울 한 줄 문구로 바꾼다. fallback은 코드도 message도 못 읽었을 때.
export const toUserMessage = (
  err: unknown,
  fallback = '오류가 발생했습니다.',
): string => {
  if (err instanceof ApiError) {
    return MESSAGES[err.code] ?? err.message ?? fallback;
  }
  if (err instanceof Error && err.message) return err.message;
  return fallback;
};

export const errorCode = (err: unknown): string | null =>
  err instanceof ApiError ? err.code : null;
