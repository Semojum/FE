import { describe, it, expect } from 'vitest';
import {
  detectFileType,
  isFileAllowedForTab,
  fileValidationMessage,
  fileSizeMessage,
  needsLocalTextExtraction,
  TAB_ALLOWED_FILE_TYPES,
} from '../fileValidation';
import { TABS } from '../../types';

const file = (name: string, type: string) => new File(['x'], name, { type });

describe('detectFileType', () => {
  it('detects pdf / image / hwp / text', () => {
    expect(detectFileType(file('a.pdf', 'application/pdf'))).toBe('pdf');
    expect(detectFileType(file('a.png', 'image/png'))).toBe('image');
    expect(detectFileType(file('a.HWP', 'application/octet-stream'))).toBe(
      'hwp',
    );
    expect(detectFileType(file('a.txt', 'text/plain'))).toBe('text');
  });
});

describe('isFileAllowedForTab', () => {
  it('OCR(a)/통합(c) 모드는 PDF만 허용', () => {
    expect(
      isFileAllowedForTab(file('a.pdf', 'application/pdf'), TABS.OCR),
    ).toBe(true);
    expect(
      isFileAllowedForTab(file('a.pdf', 'application/pdf'), TABS.INTEGRATED),
    ).toBe(true);
    expect(isFileAllowedForTab(file('a.png', 'image/png'), TABS.OCR)).toBe(
      false,
    );
    expect(isFileAllowedForTab(file('a.txt', 'text/plain'), TABS.OCR)).toBe(
      false,
    );
  });

  // HWP는 초안 생성(a)이 받는다 — 서버가 PDF로 바꿔 처리한다(2026-08-26 변경).
  it('점역(b) 모드는 TXT·HWP·HWPX를 받는다 — 한글 문서는 FE가 텍스트로 바꿔 올린다', () => {
    expect(isFileAllowedForTab(file('a.txt', 'text/plain'), TABS.BRAILLE)).toBe(
      true,
    );
    expect(isFileAllowedForTab(file('a.hwp', ''), TABS.BRAILLE)).toBe(true);
    expect(isFileAllowedForTab(file('a.hwpx', ''), TABS.BRAILLE)).toBe(true);
    expect(
      isFileAllowedForTab(file('a.pdf', 'application/pdf'), TABS.BRAILLE),
    ).toBe(false);
  });

  it('hwpx는 hwp와 다른 형식으로 가린다 — 서버가 받는 것이 다르다', () => {
    expect(detectFileType(file('a.hwpx', ''))).toBe('hwpx');
    expect(detectFileType(file('a.hwp', ''))).toBe('hwp');
    // 초안 생성(a)은 서버가 변환하는 .hwp만 받는다.
    expect(isFileAllowedForTab(file('a.hwpx', ''), TABS.OCR)).toBe(false);
    expect(needsLocalTextExtraction('hwpx')).toBe(true);
    expect(needsLocalTextExtraction('text')).toBe(false);
  });

  it('초안 생성(a) 모드는 PDF와 HWP를 받는다', () => {
    expect(isFileAllowedForTab(file('a.hwp', ''), TABS.OCR)).toBe(true);
    expect(isFileAllowedForTab(file('a.hwp', ''), TABS.INTEGRATED)).toBe(false);
  });
});

describe('TAB_ALLOWED_FILE_TYPES', () => {
  it('명세와 일치', () => {
    expect(TAB_ALLOWED_FILE_TYPES[TABS.OCR]).toEqual(['pdf', 'hwp']);
    // HWP·HWPX는 FE가 읽어 .txt로 바꿔 올린다(1차 PoC 3-1 — 서버 계약은 그대로 TXT).
    expect(TAB_ALLOWED_FILE_TYPES[TABS.BRAILLE]).toEqual([
      'text',
      'hwp',
      'hwpx',
    ]);
    expect(TAB_ALLOWED_FILE_TYPES[TABS.INTEGRATED]).toEqual(['pdf']);
  });
});

describe('fileValidationMessage', () => {
  it('탭 라벨과 허용 형식을 포함', () => {
    // 식별자(a/b/c)가 아니라 사람이 읽는 모드 이름이 들어가야 한다.
    expect(fileValidationMessage(TABS.OCR)).toBe(
      '초안 생성 모드는 PDF, HWP 파일만 지원합니다.',
    );
    expect(fileValidationMessage(TABS.BRAILLE)).toBe(
      '텍스트 점자 번역 모드는 TXT, HWP, HWPX 파일만 지원합니다.',
    );
  });
});

// 용량 초과는 **받는 자리에서** 걸러야 한다. 예전에는 업로드 단계에서만 봐서, 상한을
// 넘긴 파일이 화면에 올라간 뒤 이유 없는 "업로드 실패"만 떴다(2026-08-26 통합시험).
describe('fileSizeMessage', () => {
  const sized = (mib: number) =>
    ({ size: mib * 1024 * 1024, name: 'a.pdf' }) as File;

  it('95MiB 이하는 통과시킨다', () => {
    expect(fileSizeMessage(sized(95))).toBeNull();
  });

  it('넘기면 실제 상한과 넣은 크기를 함께 알린다', () => {
    const msg = fileSizeMessage(sized(108));
    expect(msg).toContain('95MB');
    expect(msg).toContain('108MB');
  });
});
