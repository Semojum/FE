import { describe, it, expect } from 'vitest';
import { brailleSourceFileName, mergePagesToText } from '../mergePages';
import { TranslationBlock } from '../../types';

const block = (id: string, text: string): TranslationBlock => ({
  id,
  currentText: text,
  candidates: [],
});

describe('mergePagesToText', () => {
  it('페이지 번호 순서대로 합친다 (키 순서가 뒤섞여 있어도)', () => {
    const merged = mergePagesToText({
      3: [block('c', '셋째 쪽')],
      1: [block('a', '첫째 쪽')],
      2: [block('b', '둘째 쪽')],
    });

    expect(merged).toBe('첫째 쪽\n둘째 쪽\n셋째 쪽');
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

  it('빈 블록은 버려 빈 줄이 끼지 않게 한다', () => {
    const merged = mergePagesToText({
      1: [block('a', '본문'), block('b', '   ')],
      2: [block('c', ''), block('d', '다음 쪽')],
    });

    expect(merged).toBe('본문\n다음 쪽');
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
