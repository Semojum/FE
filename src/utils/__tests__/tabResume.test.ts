import { describe, expect, it } from 'vitest';
import { needsStreamResume, receivedPages } from '../tabResume';

// 파일을 넘겨 변환 중에 다른 모드로 갔다 오면 결과 패널이 "결과가 없습니다"로 남던 문제.
// 떠날 때 resetUpload가 jobId를 비워 SSE가 끊기는데 돌아와도 다시 붙이지 않았다.

describe('receivedPages', () => {
  it('결과가 온 페이지와 상태만 온 페이지를 합친다', () => {
    const got = receivedPages({ 1: [], 3: [] }, { 2: 'BLOCKED' });
    expect([...got].sort()).toEqual([1, 2, 3]);
  });

  it('상태가 없어도 동작한다', () => {
    expect([...receivedPages({ 1: [] })]).toEqual([1]);
  });

  it('같은 페이지가 양쪽에 있어도 한 번만 센다', () => {
    expect(receivedPages({ 1: [] }, { 1: 'COMPLETED' }).size).toBe(1);
  });
});

describe('needsStreamResume', () => {
  it('아직 안 온 페이지가 있으면 다시 붙인다', () => {
    expect(needsStreamResume('job-1', 5, receivedPages({ 1: [], 2: [] }))).toBe(
      true,
    );
  });

  it('모든 페이지가 도착했으면 붙이지 않는다', () => {
    expect(
      needsStreamResume('job-1', 3, receivedPages({ 1: [], 2: [], 3: [] })),
    ).toBe(false);
  });

  it('실패한 페이지도 도착한 것으로 세어 끝난 작업은 붙이지 않는다', () => {
    expect(
      needsStreamResume('job-1', 2, receivedPages({ 1: [] }, { 2: 'BLOCKED' })),
    ).toBe(false);
  });

  it('총 페이지 수를 아직 모르면 끝났다고 단정하지 않는다', () => {
    expect(needsStreamResume('job-1', 0, new Set())).toBe(true);
  });

  it('Job이 없으면 붙일 것도 없다', () => {
    expect(needsStreamResume(null, 5, new Set())).toBe(false);
  });
});
