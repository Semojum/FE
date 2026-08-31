import { describe, it, expect } from 'vitest';
import { UNFINISHED, type UnfinishedId } from '../unfinished';

// 막기만 하고 이유를 안 적으면 고장으로 읽힌다. 문구가 비거나 한쪽만 적히는 일을 막는다.
describe('아직 완성되지 않은 기능 안내', () => {
  const ids = Object.keys(UNFINISHED) as UnfinishedId[];

  it('막는 항목마다 제목과 본문이 있다', () => {
    expect(ids.length).toBeGreaterThan(0);
    for (const id of ids) {
      expect(UNFINISHED[id].title.trim(), id).not.toBe('');
      expect(UNFINISHED[id].body.trim(), id).not.toBe('');
    }
  });

  it('제목은 무엇이 막혔는지로 끝난다 — "오류"로 읽히지 않게', () => {
    for (const id of ids) {
      expect(UNFINISHED[id].title, id).toContain('준비 중');
    }
  });

  it('본문에 무엇을 기다리는지가 적혀 있다', () => {
    for (const id of ids) {
      expect(UNFINISHED[id].body, id).toMatch(/열립니다|쓸 수 있습니다/);
    }
  });

  it('항목마다 문구가 서로 다르다 — 복사해 두고 안 고친 것을 잡는다', () => {
    expect(new Set(ids.map((id) => UNFINISHED[id].title)).size).toBe(ids.length);
    expect(new Set(ids.map((id) => UNFINISHED[id].body)).size).toBe(ids.length);
  });
});
