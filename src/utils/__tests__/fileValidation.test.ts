import { describe, it, expect } from 'vitest';
import {
  detectFileType,
  isFileAllowedForTab,
  fileValidationMessage,
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
    expect(isFileAllowedForTab(file('a.pdf', 'application/pdf'), TABS.OCR)).toBe(
      true,
    );
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

  it('점역(b) 모드는 TXT/HWP만 허용', () => {
    expect(isFileAllowedForTab(file('a.txt', 'text/plain'), TABS.BRAILLE)).toBe(
      true,
    );
    expect(isFileAllowedForTab(file('a.hwp', ''), TABS.BRAILLE)).toBe(true);
    expect(
      isFileAllowedForTab(file('a.pdf', 'application/pdf'), TABS.BRAILLE),
    ).toBe(false);
  });
});

describe('TAB_ALLOWED_FILE_TYPES', () => {
  it('명세와 일치', () => {
    expect(TAB_ALLOWED_FILE_TYPES[TABS.OCR]).toEqual(['pdf']);
    expect(TAB_ALLOWED_FILE_TYPES[TABS.BRAILLE]).toEqual(['text', 'hwp']);
    expect(TAB_ALLOWED_FILE_TYPES[TABS.INTEGRATED]).toEqual(['pdf']);
  });
});

describe('fileValidationMessage', () => {
  it('탭 라벨과 허용 형식을 포함', () => {
    expect(fileValidationMessage(TABS.OCR)).toBe(
      'OCR 변환 모드는 PDF 파일만 지원합니다.',
    );
    expect(fileValidationMessage(TABS.BRAILLE)).toBe(
      '점역 변환 모드는 TXT, HWP 파일만 지원합니다.',
    );
  });
});
