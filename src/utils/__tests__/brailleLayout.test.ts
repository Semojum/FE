import { describe, it, expect } from 'vitest';
import { buildPagesFromJob } from '@semojum/braille-assist';
import {
  blockTextWithRowEdit,
  buildLayout,
  CELLS_PER_ROW,
  firstRowIndexOfPage,
  flattenRows,
} from '../brailleLayout';
import { TranslationBlock } from '../../types';

const block = (
  id: string,
  currentText: string,
  over: Partial<TranslationBlock> = {},
): TranslationBlock =>
  ({
    id,
    currentText,
    originalText: currentText,
    candidates: [],
    ...over,
  }) as TranslationBlock;

// 32칸을 넘기는 점자 한 줄 (⠁ 40개)
const long = '⠁'.repeat(40);

describe('buildLayout', () => {
  it('빈 입력은 면을 만들지 않는다', () => {
    expect(buildLayout({}, true)).toEqual([]);
  });

  it('32칸을 넘는 줄을 여러 행으로 접고 offset을 붙인다', () => {
    const pages = buildLayout({ 1: [block('b1', long)] }, false);
    const body = flattenRows(pages).filter((r) => r.kind === 'body');

    expect(body).toHaveLength(2);
    expect(body[0].text).toHaveLength(CELLS_PER_ROW);
    expect(body[1].text).toHaveLength(40 - CELLS_PER_ROW);
    expect(body.map((r) => r.source?.offset)).toEqual([0, CELLS_PER_ROW]);
    // 접힌 두 행 모두 같은 블록의 같은 논리 줄에서 왔다
    expect(body.map((r) => r.source?.blockId)).toEqual(['b1', 'b1']);
    expect(body.map((r) => r.source?.lineIndex)).toEqual([0, 0]);
  });

  it('면은 26줄이고 쪽번호를 켜면 마지막 줄이 페이지행이다', () => {
    const pages = buildLayout({ 1: [block('b1', long)] }, true);

    expect(pages[0].rows).toHaveLength(26);
    expect(pages[0].rows[25].kind).toBe('fixed');
    // 페이지행에는 원본 쪽번호(수표 ⠼ + ⠁)가 들어간다
    expect(pages[0].rows[25].text).toContain('⠼⠁');
    // 본문이 끝난 뒤 남는 줄은 여백이다
    expect(pages[0].rows[10].kind).toBe('pad');
  });

  it('쪽번호를 끄면 페이지행이 없다', () => {
    const pages = buildLayout({ 1: [block('b1', long)] }, false);
    expect(pages[0].rows.every((r) => r.kind !== 'fixed')).toBe(true);
  });

  it('원본 쪽이 바뀌는 자리에 변경선이 들어간다', () => {
    const pages = buildLayout(
      { 1: [block('b1', '⠁⠃')], 2: [block('b2', '⠉⠙')] },
      false,
    );
    const rows = flattenRows(pages);
    const change = rows.find((r) => r.kind === 'fixed');

    expect(change?.text.startsWith('⠤')).toBe(true);
    // 원본 쪽의 마지막 블록 뒤에는 개행이 하나 남는다(BE 조립도 같다) → 빈 행 뒤 변경선.
    expect(rows.slice(0, 4).map((r) => r.kind)).toEqual([
      'body',
      'pad',
      'fixed',
      'body',
    ]);
    expect(rows[3].source?.blockId).toBe('b2');
  });

  it('빈 블록도 편집할 수 있는 본문 행으로 남는다', () => {
    const pages = buildLayout(
      { 1: [block('b1', '⠁'), block('b2', ''), block('b3', '⠃')] },
      false,
    );
    const body = flattenRows(pages).filter((r) => r.kind === 'body');

    expect(body.map((r) => r.source?.blockId)).toEqual(['b1', 'b2', 'b3']);
    expect(body[1].text).toBe('');
  });

  it('본문 텍스트는 braille-assist 조판 결과와 같다', () => {
    const blocks = { 1: [block('b1', long), block('b2', '⠃⠉')] };
    const pages = buildLayout(blocks, true);

    const direct = buildPagesFromJob({
      options: { include_page_number: true },
      footer_braille: '',
      start_braille_page: 1,
      pages: [
        {
          orig_page_no: 1,
          elements: [{ text: `${long}\n` }, { text: '⠃⠉\n' }],
        },
      ],
    });

    expect(pages.map((p) => p.rows.map((r) => r.text))).toEqual(direct);
  });

  it('블록이 여러 줄이면 줄마다 lineIndex가 올라간다', () => {
    const pages = buildLayout({ 1: [block('b1', '⠁\n⠃\n⠉')] }, false);
    const body = flattenRows(pages).filter((r) => r.kind === 'body');

    expect(body.map((r) => r.source?.lineIndex)).toEqual([0, 1, 2]);
    expect(body.map((r) => r.text)).toEqual(['⠁', '⠃', '⠉']);
  });
});

describe('firstRowIndexOfPage', () => {
  it('그 원본 페이지의 첫 본문 행을 찾는다', () => {
    const rows = flattenRows(
      buildLayout({ 1: [block('b1', '⠁')], 2: [block('b2', '⠃')] }, false),
    );
    expect(firstRowIndexOfPage(rows, 1)).toBe(0);
    // 1행 본문 + 변경선 다음
    expect(rows[firstRowIndexOfPage(rows, 2)].source?.blockId).toBe('b2');
  });

  it('없는 페이지는 0을 준다', () => {
    const rows = flattenRows(buildLayout({ 1: [block('b1', '⠁')] }, false));
    expect(firstRowIndexOfPage(rows, 9)).toBe(0);
  });
});

describe('blockTextWithRowEdit', () => {
  const src = { pageNo: 1, blockId: 'b1', lineIndex: 0, offset: 0 };

  it('접히지 않은 행은 그 줄을 통째로 바꾼다', () => {
    expect(blockTextWithRowEdit('⠁⠃', src, '⠁⠃', '⠉⠙')).toBe('⠉⠙');
  });

  it('접힌 두 번째 행을 고치면 논리 줄의 그 구간만 바뀐다', () => {
    const text = `${'⠁'.repeat(32)}⠃⠃`;
    const edited = blockTextWithRowEdit(
      text,
      { ...src, offset: 32 },
      '⠃⠃',
      '⠉⠉⠉',
    );
    // 앞 32칸은 그대로, 뒤 구간만 교체 — 길이가 늘어 다음 행으로 다시 접힌다
    expect(edited).toBe(`${'⠁'.repeat(32)}⠉⠉⠉`);
  });

  it('여러 줄 블록에서 해당 줄만 바꾼다', () => {
    expect(
      blockTextWithRowEdit('⠁\n⠃\n⠉', { ...src, lineIndex: 1 }, '⠃', '⠭'),
    ).toBe('⠁\n⠭\n⠉');
  });
});
