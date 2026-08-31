import { describe, it, expect, beforeEach } from 'vitest';
import {
  buildLayout,
  makeFooterTag,
  PAGE_BREAK_TAG,
  resetLayoutMemo,
} from '../brailleLayout';
import { DEFAULT_TYPESET } from '../typesetOptions';
import type { TranslationBlock } from '../../types';

// 토막 조판 메모가 지켜야 할 성질은 하나다 — **메모가 차 있든 비어 있든 결과가 같다.**
// 여기서 재는 것은 빠르기가 아니라 그 등가성이다. 앞 토막을 고쳐 뒤 토막의 자리가
// 밀리는 경우(점자 쪽번호가 달라진다)가 특히 위험해서 따로 짚는다.

const block = (id: string, currentText: string): TranslationBlock =>
  ({ id, currentText, candidates: [] }) as TranslationBlock;

const brk = (id: string) => block(id, PAGE_BREAK_TAG);
const long = (ch: string, n: number) => ch.repeat(n);

// 쪽바꿈으로 토막이 셋인 문서
const doc = (firstText: string): Record<number, TranslationBlock[]> => ({
  1: [block('a1', firstText), brk('k1'), block('a2', long('⠃', 200))],
  2: [block('b1', long('⠉', 150)), brk('k2'), block('b2', long('⠙', 120))],
});

const cold = (d: Record<number, TranslationBlock[]>) => {
  resetLayoutMemo();
  return buildLayout(d, true, '', DEFAULT_TYPESET);
};

describe('토막 조판 메모', () => {
  beforeEach(() => resetLayoutMemo());

  it('메모가 차 있어도 같은 판면이 나온다 — 한 토막만 고칠 때', () => {
    buildLayout(doc(long('⠁', 100)), true, '', DEFAULT_TYPESET); // 메모를 채운다
    const edited = doc(long('⠁', 100).replace(/^⠁/, '⠚'));
    const warm = buildLayout(edited, true, '', DEFAULT_TYPESET);
    expect(warm).toEqual(cold(edited));
  });

  it('앞 토막의 길이가 달라져 뒤가 밀려도 같다 — 점자 쪽번호가 걸린 자리', () => {
    buildLayout(doc(long('⠁', 100)), true, '', DEFAULT_TYPESET);
    // 첫 토막을 크게 늘려 면 수를 바꾼다 → 뒤 토막의 startPage가 전부 밀린다.
    const grown = doc(long('⠁', 3000));
    const warm = buildLayout(grown, true, '', DEFAULT_TYPESET);
    expect(warm).toEqual(cold(grown));
  });

  it('앞 토막이 줄어들어도 같다', () => {
    buildLayout(doc(long('⠁', 3000)), true, '', DEFAULT_TYPESET);
    const shrunk = doc(long('⠁', 40));
    const warm = buildLayout(shrunk, true, '', DEFAULT_TYPESET);
    expect(warm).toEqual(cold(shrunk));
  });

  it('조판 설정이 바뀌면 꺼내 쓰지 않는다', () => {
    const d = doc(long('⠁', 100));
    buildLayout(d, true, '', DEFAULT_TYPESET);
    const narrow = { ...DEFAULT_TYPESET, cols: 20 };
    const warm = buildLayout(d, true, '', narrow);
    resetLayoutMemo();
    expect(warm).toEqual(buildLayout(d, true, '', narrow));
  });

  it('쪽번호 삽입을 끄면 꺼내 쓰지 않는다', () => {
    const d = doc(long('⠁', 100));
    buildLayout(d, true, '', DEFAULT_TYPESET);
    const warm = buildLayout(d, false, '', DEFAULT_TYPESET);
    resetLayoutMemo();
    expect(warm).toEqual(buildLayout(d, false, '', DEFAULT_TYPESET));
  });

  it('토막이 새로 생겨도 같다 — 쪽바꿈을 하나 더 넣는 경우', () => {
    buildLayout(doc(long('⠁', 100)), true, '', DEFAULT_TYPESET);
    const more: Record<number, TranslationBlock[]> = {
      1: [
        block('a1', long('⠁', 100)),
        brk('k1'),
        block('a2', long('⠃', 100)),
        brk('k3'),
        block('a3', long('⠃', 100)),
      ],
      2: [block('b1', long('⠉', 150)), brk('k2'), block('b2', long('⠙', 120))],
    };
    const warm = buildLayout(more, true, '', DEFAULT_TYPESET);
    expect(warm).toEqual(cold(more));
  });

  it('구간 꼬리말로 갈린 토막도 같다', () => {
    const withFooter: Record<number, TranslationBlock[]> = {
      1: [
        block('a1', long('⠁', 100)),
        block('f1', makeFooterTag('1단원')),
        block('a2', long('⠃', 150)),
      ],
    };
    buildLayout(withFooter, true, '', DEFAULT_TYPESET);
    const edited: Record<number, TranslationBlock[]> = {
      1: [
        block('a1', long('⠁', 100)),
        block('f1', makeFooterTag('2단원')),
        block('a2', long('⠃', 150)),
      ],
    };
    const warm = buildLayout(edited, true, '', DEFAULT_TYPESET);
    expect(warm).toEqual(cold(edited));
  });

  it('토막이 하나뿐인 문서도 그냥 된다 (메모를 안 한다)', () => {
    const plain = { 1: [block('only', long('⠁', 300))] };
    buildLayout(plain, true, '', DEFAULT_TYPESET);
    const warm = buildLayout(plain, true, '', DEFAULT_TYPESET);
    expect(warm).toEqual(cold(plain));
  });

  it('같은 문서를 두 번 조판하면 완전히 같다', () => {
    const d = doc(long('⠁', 100));
    const first = buildLayout(d, true, '', DEFAULT_TYPESET);
    const second = buildLayout(d, true, '', DEFAULT_TYPESET);
    expect(second).toEqual(first);
  });
});
