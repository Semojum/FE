import { JobPageOriginal } from '../types/auth';

// 페이지 원본 중 왼쪽 미리보기에 그릴 수 있는 것(url이 있는 PDF·이미지)만 남긴다.
//
// 점역(b) 저장본의 원본은 텍스트 줄 목록(type 'text' · url=null)이다. 이걸 페이지
// 원본 경로(savedOriginalsByPage)에 넣으면 미리보기 effect가 PDF 원본을 찾다
// "원본을 불러오지 못했습니다"로 텍스트 미리보기를 덮는다 — 텍스트 점자 번역 작업을
// 마이페이지에서 열면 왼쪽이 몇 초 뒤 오류로 바뀌던 원인(2026-08-26 QA).
export const renderableOriginals = (
  originals: Record<number, JobPageOriginal> | undefined | null,
): Record<number, JobPageOriginal> =>
  Object.fromEntries(
    Object.entries(originals ?? {}).filter(([, o]) => !!o?.url),
  );

// url 없이 lines만 있는 텍스트 원본인지 — 그릴 PDF가 없는 게 정상인 경우다.
export const isTextOriginal = (
  original: JobPageOriginal | undefined | null,
): boolean => !!original && !original.url && Array.isArray(original.lines);
