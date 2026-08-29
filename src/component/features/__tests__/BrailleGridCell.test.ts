import { describe, it, expect } from 'vitest';
import { cellClassFor } from '../conversion/BrailleGrid';
import type { LayoutRow } from '../../../utils/brailleLayout';

// 칸 클래스는 상태 조합마다 **미리 만들어 둔 문자열 하나**를 돌려준다(flyweight).
// 예전에는 칸마다 배열을 만들어 join했다 — 한 면이 920칸이라 드래그 한 번에
// 수만 번 돌았다. 색이 바뀌면 판면이 통째로 달라 보이므로 조합마다 못 박아 둔다.

const body = (over: Partial<LayoutRow> = {}): LayoutRow =>
  ({ kind: 'body', text: '⠁', ...over }) as LayoutRow;
const fixed = (): LayoutRow => ({ kind: 'fixed', text: '⠤' }) as LayoutRow;

const tokens = (cls: string) => new Set(cls.split(/\s+/).filter(Boolean));
const has = (cls: string, token: string) => tokens(cls).has(token);

const BASE = [
  'flex',
  'h-[19px]',
  'w-[19px]',
  'shrink-0',
  'items-center',
  'justify-center',
  'border-r',
  'border-b',
  'text-[13px]',
  'leading-none',
  'border-[#e4ebf5]',
];

describe('판면 칸 클래스', () => {
  it('어떤 상태든 공통 뼈대를 갖는다 — 칸 크기가 흔들리면 조판이 어긋난다', () => {
    const cases = [
      cellClassFor(body(), false, false, false, false),
      cellClassFor(body(), true, true, false, false),
      cellClassFor(fixed(), false, false, false, false),
      cellClassFor(body(), false, false, false, true, 'active', true),
    ];
    for (const cls of cases) {
      for (const t of BASE) expect(has(cls, t)).toBe(true);
    }
  });

  it('상태마다 배경색이 하나씩 정해져 있다', () => {
    expect(has(cellClassFor(body(), true, true, false, false), 'bg-[#5b8ce6]')).toBe(true);
    expect(
      has(cellClassFor(body(), false, false, false, false, 'none', true), 'bg-[#5b8ce6]/35'),
    ).toBe(true);
    expect(has(cellClassFor(body(), false, false, false, false, 'active'), 'bg-[#f9c74f]')).toBe(true);
    expect(has(cellClassFor(body(), false, false, false, false, 'hit'), 'bg-[#fdf1c7]')).toBe(true);
    expect(has(cellClassFor(body(), true, false, false, false), 'bg-[#5b8ce6]/10')).toBe(true);
    expect(has(cellClassFor(fixed(), false, false, false, false), 'bg-[#f2f5fa]')).toBe(true);
    expect(
      has(cellClassFor(body({ source: { isBlocked: true } } as Partial<LayoutRow>), false, false, false, false), 'bg-[#fdf8e3]'),
    ).toBe(true);
    expect(has(cellClassFor(body(), false, false, true, false), 'bg-[#fbe4d3]')).toBe(true);
    expect(has(cellClassFor(body(), false, false, false, false), 'bg-white')).toBe(true);
  });

  it('우선순위 — 커서 > 고른 구간 > 찾기 > 커서 행', () => {
    // 고른 구간 위에 커서가 있으면 커서 색이 이긴다.
    expect(has(cellClassFor(body(), true, true, false, false, 'active', true), 'bg-[#5b8ce6]')).toBe(true);
    // 찾기에 걸린 칸이라도 고른 구간이면 선택 색으로 보인다.
    expect(has(cellClassFor(body(), true, false, false, false, 'hit', true), 'bg-[#5b8ce6]/35')).toBe(true);
  });

  it('태그는 흐리게 그리되 커서 칸은 흰 글자라 흐리게 하지 않는다', () => {
    expect(has(cellClassFor(body(), false, false, false, true), 'text-[#c8ccd4]')).toBe(true);
    expect(has(cellClassFor(body(), true, true, false, true), 'text-[#c8ccd4]')).toBe(false);
  });

  it('같은 상태는 같은 문자열 참조를 돌려준다 (flyweight)', () => {
    const a = cellClassFor(body(), false, false, false, false);
    const b = cellClassFor(body({ text: '⠭' }), false, false, false, false);
    expect(a).toBe(b);
    // 다른 줄·다른 글자여도 상태가 같으면 새 문자열을 만들지 않는다.
    expect(Object.is(a, b)).toBe(true);
  });

  it('서로 다른 상태는 서로 다른 문자열이다', () => {
    const plain = cellClassFor(body(), false, false, false, false);
    const caret = cellClassFor(body(), true, true, false, false);
    expect(plain).not.toBe(caret);
  });
});
