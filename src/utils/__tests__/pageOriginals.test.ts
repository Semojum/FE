import { describe, expect, it } from 'vitest';
import { isTextOriginal, renderableOriginals } from '../pageOriginals';
import { JobPageOriginal } from '../../types/auth';

// 점역(b) 저장본의 원본은 텍스트 줄 목록(url=null)이다. 이게 페이지 원본 경로에
// 들어가면 왼쪽 미리보기가 PDF 원본을 찾다 "원본을 불러오지 못했습니다"로 덮인다
// (2026-08-26 QA). 그릴 수 있는(url 있는) 원본만 통과시키는지 잡아 둔다.

const textOriginal: JobPageOriginal = {
  type: 'text',
  url: null,
  lines: ['첫 줄', '둘째 줄'],
};
const pdfOriginal: JobPageOriginal = {
  type: 'pdf',
  url: 'https://signed.example/page-1.pdf',
  lines: null,
};

describe('renderableOriginals', () => {
  it('url 없는 텍스트 원본(점역 b)은 걸러낸다', () => {
    expect(renderableOriginals({ 1: textOriginal, 2: textOriginal })).toEqual(
      {},
    );
  });

  it('url 있는 원본(이미지 모드 a/c)은 그대로 남긴다', () => {
    expect(renderableOriginals({ 1: pdfOriginal, 2: textOriginal })).toEqual({
      1: pdfOriginal,
    });
  });

  it('비어 있으면 빈 객체를 준다', () => {
    expect(renderableOriginals(undefined)).toEqual({});
    expect(renderableOriginals(null)).toEqual({});
  });
});

describe('isTextOriginal', () => {
  it('url 없이 lines만 있으면 텍스트 원본이다', () => {
    expect(isTextOriginal(textOriginal)).toBe(true);
  });

  it('url이 있거나 아예 없으면 텍스트 원본이 아니다', () => {
    expect(isTextOriginal(pdfOriginal)).toBe(false);
    expect(isTextOriginal(undefined)).toBe(false);
    expect(isTextOriginal(null)).toBe(false);
  });
});
