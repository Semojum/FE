import { describe, it, expect, beforeEach } from 'vitest';
import {
  forgetJobTypeset,
  loadJobTypeset,
  saveJobTypeset,
} from '../jobTypeset';
import { DEFAULT_TYPESET, type TypesetOptions } from '../typesetOptions';

const opts = (over: Partial<TypesetOptions> = {}): TypesetOptions => ({
  ...DEFAULT_TYPESET,
  ...over,
});

describe('작업별 조판 설정', () => {
  beforeEach(() => window.localStorage.clear());

  it('작업마다 따로 남는다 — 파일을 오가도 제 규격으로 열린다', () => {
    saveJobTypeset('job-a', opts({ cols: 32, rows: 26 }));
    saveJobTypeset('job-b', opts({ cols: 40, rows: 25 }));
    expect(loadJobTypeset('job-a')?.cols).toBe(32);
    expect(loadJobTypeset('job-b')?.cols).toBe(40);
  });

  it('정해 둔 적 없는 작업은 null — 호출부가 기본 설정으로 연다', () => {
    expect(loadJobTypeset('처음 보는 작업')).toBeNull();
  });

  it('같은 작업을 다시 저장하면 덮어쓴다', () => {
    saveJobTypeset('job-a', opts({ cols: 32 }));
    saveJobTypeset('job-a', opts({ cols: 36 }));
    expect(loadJobTypeset('job-a')?.cols).toBe(36);
  });

  it('저장된 값이 범위를 벗어나 있으면 되돌려 준다', () => {
    window.localStorage.setItem(
      'semojum.jobTypeset',
      JSON.stringify({ 'job-a': { cols: 9999, rows: 0, pageRowOn: '이상한값' } }),
    );
    const loaded = loadJobTypeset('job-a');
    expect(loaded?.cols).toBeLessThanOrEqual(48);
    expect(loaded?.rows).toBeGreaterThanOrEqual(4);
    expect(loaded?.pageRowOn).toBe(DEFAULT_TYPESET.pageRowOn);
  });

  it('저장소가 망가져 있어도 기본값으로 연다', () => {
    window.localStorage.setItem('semojum.jobTypeset', '{망가진 JSON');
    expect(loadJobTypeset('job-a')).toBeNull();
    // 이어서 저장하는 것도 막히지 않는다.
    saveJobTypeset('job-a', opts({ cols: 36 }));
    expect(loadJobTypeset('job-a')?.cols).toBe(36);
  });

  it('상한을 넘으면 오래 쓴 작업부터 버린다', () => {
    for (let i = 0; i < 205; i++) saveJobTypeset(`job-${i}`, opts({ cols: 32 }));
    expect(loadJobTypeset('job-0')).toBeNull();
    expect(loadJobTypeset('job-204')).not.toBeNull();
  });

  it('최근에 다시 저장한 작업은 상한에서 살아남는다', () => {
    saveJobTypeset('오래된 작업', opts({ cols: 36 }));
    for (let i = 0; i < 199; i++) saveJobTypeset(`job-${i}`, opts());
    // 다시 저장해 "최근"으로 만든 뒤 더 밀어 넣는다.
    saveJobTypeset('오래된 작업', opts({ cols: 36 }));
    for (let i = 200; i < 210; i++) saveJobTypeset(`job-${i}`, opts());
    expect(loadJobTypeset('오래된 작업')?.cols).toBe(36);
  });

  it('작업을 지우면 함께 지운다', () => {
    saveJobTypeset('job-a', opts({ cols: 36 }));
    forgetJobTypeset('job-a');
    expect(loadJobTypeset('job-a')).toBeNull();
  });
});
