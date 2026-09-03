import { describe, it, expect } from 'vitest';
import {
  brailleSourceFileName,
  mergePagesToText,
  ORIG_PAGE_SEPARATOR,
} from '../mergePages';
import { TranslationBlock } from '../../types';

const block = (id: string, text: string): TranslationBlock => ({
  id,
  currentText: text,
  candidates: [],
});

const SEP = ORIG_PAGE_SEPARATOR;

describe('mergePagesToText', () => {
  // 서버는 하이픈 40개 줄만 원본 쪽 경계로 읽는다(2026-09-03 실서버 실측).
  // 39개·41개·em대시는 못 알아보고 30줄 청크로 되돌아간다.
  it('원본 쪽 경계 표식은 하이픈 40개 줄이다', () => {
    expect(SEP).toBe('-'.repeat(40));
  });

  it('페이지 번호 순서대로 합치고 쪽 사이에 경계 표식을 넣는다', () => {
    const merged = mergePagesToText({
      3: [block('c', '셋째 쪽')],
      1: [block('a', '첫째 쪽')],
      2: [block('b', '둘째 쪽')],
    });

    expect(merged).toBe(`첫째 쪽\n${SEP}\n둘째 쪽\n${SEP}\n셋째 쪽`);
  });

  it('한 쪽뿐이면 표식을 넣지 않는다', () => {
    expect(mergePagesToText({ 1: [block('a', '한 쪽')] })).toBe('한 쪽');
  });

  it('한 페이지 안의 블록 순서를 그대로 유지한다', () => {
    const merged = mergePagesToText({
      1: [block('a', '제목'), block('b', '본문 1'), block('c', '본문 2')],
    });

    expect(merged).toBe('제목\n본문 1\n본문 2');
  });

  it('여러 줄 블록의 줄바꿈을 보존한다', () => {
    const merged = mergePagesToText({ 1: [block('a', '첫 줄\n둘째 줄')] });

    expect(merged).toBe('첫 줄\n둘째 줄');
  });

  // 줄 끝에 CR이 남으면 표식 줄이 "…----\r"가 되어 서버가 못 알아본다.
  it('CRLF 줄 끝을 LF로 맞춘다', () => {
    const merged = mergePagesToText({
      1: [block('a', '첫 줄\r\n둘째 줄')],
      2: [block('b', '다음 쪽')],
    });

    expect(merged).toBe(`첫 줄\n둘째 줄\n${SEP}\n다음 쪽`);
  });

  it('빈 블록은 버려 빈 줄이 끼지 않게 한다', () => {
    const merged = mergePagesToText({
      1: [block('a', '본문'), block('b', '   ')],
      2: [block('c', ''), block('d', '다음 쪽')],
    });

    expect(merged).toBe(`본문\n${SEP}\n다음 쪽`);
  });

  // 서버도 내용이 없는 쪽은 페이지로 세지 않는다(실측) — 표식만 남길 이유가 없다.
  it('통째로 빈 쪽은 표식째 버린다', () => {
    const merged = mergePagesToText({
      1: [block('a', '첫째 쪽')],
      2: [block('b', '  ')],
      3: [block('c', '셋째 쪽')],
    });

    expect(merged).toBe(`첫째 쪽\n${SEP}\n셋째 쪽`);
  });

  it('블록이 없으면 빈 문자열', () => {
    expect(mergePagesToText({})).toBe('');
  });
});

describe('brailleSourceFileName', () => {
  it('원본 이름을 물려주고 확장자만 .txt로 바꾼다', () => {
    expect(brailleSourceFileName('수학 교과서.pdf')).toBe('수학 교과서.txt');
  });

  it('확장자가 없으면 그대로 두고 .txt를 붙인다', () => {
    expect(brailleSourceFileName('교재')).toBe('교재.txt');
  });

  it('원본 이름을 모르면 기본 이름을 쓴다', () => {
    expect(brailleSourceFileName(null)).toBe('점역으로 보내기.txt');
    expect(brailleSourceFileName('')).toBe('점역으로 보내기.txt');
  });
});
