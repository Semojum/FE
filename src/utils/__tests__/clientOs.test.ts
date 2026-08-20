import { describe, expect, it } from 'vitest';
import { formatOs, osFromUserAgent } from '../clientOs';

// 데스크톱 앱의 요청은 네이티브에서 나가 UA에 OS가 없다 — 그래서 FE가 X-Client-Os를
// 직접 보낸다(명세 2026-08-20). 값이 사람이 읽는 형태여야 운영자 콘솔에서 쓸모가 있다.

describe('formatOs', () => {
  it('윈도우는 빌드 번호로 10과 11을 가른다', () => {
    expect(formatOs('windows', '10.0.22631')).toBe('Windows 11');
    expect(formatOs('windows', '10.0.19045')).toBe('Windows 10');
  });

  it('맥·리눅스는 버전을 그대로 붙인다', () => {
    expect(formatOs('macos', '15.2')).toBe('macOS 15.2');
    expect(formatOs('linux', '6.8.0')).toBe('Linux 6.8.0');
    expect(formatOs('macos', null)).toBe('macOS');
  });
});

describe('osFromUserAgent', () => {
  it('브라우저(개발)에서는 UA로 대신한다', () => {
    expect(osFromUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64)')).toBe(
      'Windows 10',
    );
    expect(
      osFromUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)'),
    ).toBe('macOS 10.15');
    expect(osFromUserAgent('Mozilla/5.0 (X11; Linux x86_64)')).toBe('Linux');
    expect(osFromUserAgent('알 수 없는 클라이언트')).toBeNull();
  });
});
