import { describe, it, expect } from 'vitest';
import { buildPagesFromJob, pageChangeLine } from '@semojum/braille-assist';
import {
  blockTextWithRowEdit,
  buildLayout,
  CELLS_PER_ROW,
  firstRowIndexOfPage,
  anchorAt,
  resolveAnchor,
  flattenRows,
  footerMarkBefore,
  insertPageBreakBefore,
  makeFooterTag,
  PAGE_BREAK_TAG,
  sectionFooterTexts,
  setSectionFooterBefore,
} from '../brailleLayout';
import { DEFAULT_TYPESET } from '../typesetOptions';
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

  // QA 2026-09-02: "꼬리말이 빈칸이라 정렬을 테스트하지 못했다."
  // 2026-09-03 실서버 대조: 아래 두 줄이 BE가 만든 .brf의 페이지행과 글자까지 같다.
  //   center  #a     ,mja #a-#b4 ij7j5,m    #a
  //   right   #a       ,mja #a-#b4 ij7j5,m  #a
  it('꼬리말 정렬 — 오른쪽은 점자 면 번호에서 두 칸 띄운 자리가 끝이다', () => {
    const footer = '⠠⠍⠚⠁⠀⠼⠁⠤⠼⠃⠲⠀⠊⠚⠶⠚⠢⠠⠍';
    const rowFor = (footerAlign: 'center' | 'right') => {
      const rows = buildLayout({ 1: [block('b1', '⠁')] }, true, footer, {
        ...DEFAULT_TYPESET,
        footerAlign,
        pageRowOn: 'every',
      })[0].rows;
      return rows[rows.length - 1].text;
    };

    const center = rowFor('center');
    const right = rowFor('right');
    expect(center).not.toBe(right);
    expect(center).toHaveLength(DEFAULT_TYPESET.cols);
    expect(right).toHaveLength(DEFAULT_TYPESET.cols);
    expect(right.endsWith(`${footer}⠀⠀⠼⠁`)).toBe(true);
  });

  // QA 2026-09-02: "꼬리말 내용이 아예 점역이 안 되고 빈칸으로 나온다."
  // 원인은 서버가 점역된 꼬리말을 안 주던 것이었고, 2026-09-03 SSE page_done의
  // footer_braille · 페이지 조회의 footerBraille로 들어왔다. 받은 값을 그대로
  // 넘기면 페이지행 가운데에 찍힌다.
  it('점역된 꼬리말을 넘기면 페이지행 가운데에 들어간다', () => {
    const footer = '⠍⠣⠚⠁'; // 서버가 점역해 준 꼬리말
    const pages = buildLayout({ 1: [block('b1', long)] }, true, footer);
    const pageRowText = pages[0].rows[25].text;
    expect(pageRowText).toContain(footer);
    // 안 넘기면 그 자리가 빈칸이던 것이 종전 동작이다.
    expect(buildLayout({ 1: [block('b1', long)] }, true)[0].rows[25].text).not.toContain(
      footer,
    );
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

  // 2026-09-02 braille-assist 갱신 — 변경선을 끌 수 있게 됐다.
  it('변경선을 끄면 그 줄이 사라진다', () => {
    const blocks = { 1: [block('b1', '⠁⠃')], 2: [block('b2', '⠉⠙')] };
    const off = flattenRows(
      buildLayout(blocks, false, '', {
        ...DEFAULT_TYPESET,
        showChangeLine: false,
      }),
    );
    expect(off.some((r) => r.text.startsWith('⠤'))).toBe(false);
    // 본문은 그대로 두 블록이 남는다 — 줄만 빠진다.
    expect(off.filter((r) => r.kind === 'body').map((r) => r.source?.blockId)).toEqual(
      expect.arrayContaining(['b1', 'b2']),
    );
  });

  it('꼬리말 우측 정렬은 가운데 정렬과 다른 자리에 찍힌다', () => {
    const blocks = { 1: [block('b1', '⠁⠃')] };
    const rowOf = (footerAlign: 'center' | 'right') =>
      flattenRows(
        buildLayout(blocks, true, '⠋⠕', {
          ...DEFAULT_TYPESET,
          footerAlign,
        }),
      ).find((r) => r.kind === 'fixed')?.text ?? '';
    expect(rowOf('center')).not.toBe('');
    expect(rowOf('right')).not.toBe(rowOf('center'));
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

// 1차 PoC(2026-08-26) 요청 — 단원이 바뀌는 자리에서 새 면부터 시작한다.
// 규칙은 라이브러리가 그대로 적용하고, FE는 표식에서 토막을 나눠 이어 붙이기만 한다.
describe('쪽 바꿈 표식', () => {
  it('표식 뒤 내용은 새 면에서 시작한다', () => {
    const withBreak = buildLayout(
      {
        1: [
          block('b1', '⠁'),
          block('brk', PAGE_BREAK_TAG),
          block('b2', '⠃'),
        ],
      },
      false,
    );
    expect(withBreak).toHaveLength(2);
    // 표식 자체는 판면에 그리지 않는다 — 면을 끊는 지시일 뿐이다.
    const texts = flattenRows(withBreak)
      .filter((r) => r.kind === 'body')
      .map((r) => r.text.trim())
      .filter(Boolean);
    expect(texts).toEqual(['⠁', '⠃']);
  });

  it('표식이 없으면 한 면에 이어 붙는다', () => {
    const plain = buildLayout(
      { 1: [block('b1', '⠁'), block('b2', '⠃')] },
      false,
    );
    expect(plain).toHaveLength(1);
  });

  it('표식 뒤 행도 제 블록을 출처로 갖는다', () => {
    const pages = buildLayout(
      { 1: [block('b1', '⠁'), block('brk', PAGE_BREAK_TAG), block('b2', '⠃')] },
      false,
    );
    const body = flattenRows(pages).filter((r) => r.kind === 'body' && r.text.trim());
    expect(body.map((r) => r.source?.blockId)).toEqual(['b1', 'b2']);
  });

  it('문서 첫 줄의 표식은 빈 면을 만들지 않는다', () => {
    const pages = buildLayout(
      { 1: [block('brk', PAGE_BREAK_TAG), block('b1', '⠁')] },
      false,
    );
    expect(pages).toHaveLength(1);
  });
  // Ctrl+Enter로 표식을 넣는 자리. 예전에는 addBlock으로 넣고 그 자리에서 다시 읽어
  // 배열을 조립했는데, 읽기가 갱신 전 배열이라 커서가 있던 줄의 본문이 표식으로
  // 갈아치워졌다(2026-08-29 확인).
  describe('insertPageBreakBefore', () => {
    const three = [block('A', '가나다'), block('B', '라마바'), block('C', '사아자')];

    it('커서가 있던 블록 앞에 표식을 넣고, 그 블록의 본문은 그대로 둔다', () => {
      const r = insertPageBreakBefore(three, 'B');
      expect(r.status).toBe('inserted');
      if (r.status !== 'inserted') return;
      expect(r.blocks.map((b) => b.currentText)).toEqual([
        '가나다',
        PAGE_BREAK_TAG,
        '라마바',
        '사아자',
      ]);
      // 원래 블록들은 id까지 그대로 남는다 — 저장이 기존 요소를 수정으로 보내야 한다.
      expect(r.blocks.filter((b) => b.currentText !== PAGE_BREAK_TAG).map((b) => b.id)).toEqual([
        'A',
        'B',
        'C',
      ]);
      // 새 표식만 서버가 모르는 로컬 id를 갖는다.
      expect(r.blocks[1].id).not.toBe('B');
    });

    it('넘겨받은 배열을 건드리지 않는다', () => {
      insertPageBreakBefore(three, 'B');
      expect(three.map((b) => b.currentText)).toEqual(['가나다', '라마바', '사아자']);
    });

    it('첫 블록 앞에도 넣을 수 있다', () => {
      const r = insertPageBreakBefore(three, 'A');
      expect(r.status === 'inserted' && r.blocks[0].currentText).toBe(PAGE_BREAK_TAG);
    });

    it('바로 앞이 이미 표식이면 더 넣지 않는다', () => {
      const withBreak = [block('A', '가나다'), block('brk', PAGE_BREAK_TAG), block('B', '라마바')];
      expect(insertPageBreakBefore(withBreak, 'B').status).toBe('already');
    });

    it('없는 블록이면 아무것도 하지 않는다', () => {
      expect(insertPageBreakBefore(three, '없음').status).toBe('not-found');
    });

    it('넣은 결과를 조판하면 그 자리에서 면이 갈린다', () => {
      const r = insertPageBreakBefore([block('b1', '⠁'), block('b2', '⠃')], 'b2');
      if (r.status !== 'inserted') throw new Error('삽입 실패');
      expect(buildLayout({ 1: r.blocks }, false)).toHaveLength(2);
    });
  });
});

// 조판 설정이 라이브러리 옵션으로 그대로 넘어가는지 (규격·페이지행 범위)
describe('조판 설정', () => {
  it('칸 수를 줄이면 그 폭에서 접힌다', () => {
    const pages = buildLayout({ 1: [block('b1', long)] }, false, '', {
      ...DEFAULT_TYPESET,
      cols: 20,
    });
    const body = flattenRows(pages).filter((r) => r.kind === 'body');
    expect(body[0].text).toHaveLength(20);
  });

  it('줄 수를 줄이면 면이 더 빨리 넘어간다', () => {
    const many = Array.from({ length: 12 }, (_, i) => block(`b${i}`, '⠁'));
    const short = buildLayout({ 1: many }, false, '', {
      ...DEFAULT_TYPESET,
      rows: 5,
    });
    expect(short.length).toBeGreaterThan(
      buildLayout({ 1: many }, false).length,
    );
  });
});

// 1차 PoC(2026-08-26) 피드백 — "단원마다 꼬리말이 달라야 하므로 페이지별 위치 지정 필요".
describe('구간 꼬리말', () => {
  const withFooter = (footerText: string) => ({ ...DEFAULT_TYPESET, footerText });

  it('문서에 든 구간 꼬리말 묵자를 중복 없이 모은다', () => {
    const texts = sectionFooterTexts({
      1: [block('a', '⠁'), block('m1', makeFooterTag('제3장 함수'))],
      2: [block('m2', makeFooterTag('부록')), block('m3', makeFooterTag('제3장 함수'))],
      3: [block('m4', makeFooterTag(''))], // 꼬리말 빼기 — 점역할 것이 없다
    });
    expect(texts.sort()).toEqual(['부록', '제3장 함수']);
  });

  // 토막마다 제 꼬리말 점자를 넘긴다. 작업 전체 꼬리말은 서버가 준 값(footerBraille),
  // 구간 꼬리말은 표에서 찾는다 — 표에 없으면 그 면의 꼬리말 자리를 비운다
  // (틀린 점자를 찍는 것보다 낫다).
  it('면마다 그 구간의 꼬리말 점자가 페이지행에 들어간다', () => {
    const base = '⠠⠍⠚⠁'; // 작업 전체 꼬리말 (서버 점역)
    const section = '⠨⠝⠼⠉⠨⠶'; // 구간 꼬리말 (임시 점역)
    const pages = buildLayout(
      {
        1: [
          block('b1', '⠁'),
          block('mark', makeFooterTag('제3장 함수')),
          block('b2', '⠃'),
        ],
      },
      true,
      base,
      { ...withFooter('수학 I'), pageRowOn: 'every' },
      { '제3장 함수': section },
    );

    expect(pages).toHaveLength(2);
    const rowOf = (i: number) => pages[i].rows[pages[i].rows.length - 1].text;
    expect(rowOf(0)).toContain(base);
    expect(rowOf(0)).not.toContain(section);
    expect(rowOf(1)).toContain(section);
    expect(rowOf(1)).not.toContain(base);
  });

  it('점역하지 못한 구간 꼬리말은 그 면의 꼬리말 자리를 비운다', () => {
    const base = '⠠⠍⠚⠁';
    const pages = buildLayout(
      {
        1: [
          block('b1', '⠁'),
          block('mark', makeFooterTag('Ⅱ. 문학')),
          block('b2', '⠃'),
        ],
      },
      true,
      base,
      { ...withFooter('수학 I'), pageRowOn: 'every' },
      {}, // 못 바꿨다
    );
    const second = pages[1].rows[pages[1].rows.length - 1].text;
    expect(second).not.toContain(base);
    expect(second).toHaveLength(DEFAULT_TYPESET.cols);
  });

  it('표식 자리에서 면이 갈리고, 뒤 면부터 새 꼬리말을 쓴다', () => {
    const pages = buildLayout(
      {
        1: [
          block('b1', '⠁'),
          block('mark', makeFooterTag('제3장 함수')),
          block('b2', '⠃'),
        ],
      },
      false,
      '',
      withFooter('수학 I'),
    );
    expect(pages).toHaveLength(2);
    expect(pages.map((p) => p.footerText)).toEqual(['수학 I', '제3장 함수']);
    // 표식 줄은 판면에 그리지 않는다 — 꼬리말을 정하는 지시일 뿐이다.
    const texts = flattenRows(pages)
      .filter((r) => r.kind === 'body')
      .map((r) => r.text.trim())
      .filter(Boolean);
    expect(texts).toEqual(['⠁', '⠃']);
  });

  it('표식이 없으면 모든 면이 작업 전체 꼬리말을 쓴다', () => {
    const pages = buildLayout(
      { 1: [block('b1', '⠁')] },
      false,
      '',
      withFooter('수학 I'),
    );
    expect(pages.map((p) => p.footerText)).toEqual(['수학 I']);
  });

  it('빈 표식은 그 자리부터 꼬리말을 뺀다', () => {
    const pages = buildLayout(
      {
        1: [block('b1', '⠁'), block('mark', makeFooterTag('')), block('b2', '⠃')],
      },
      false,
      '',
      withFooter('수학 I'),
    );
    expect(pages.map((p) => p.footerText)).toEqual(['수학 I', '']);
  });

  it('문서 첫 줄의 표식은 빈 면을 만들지 않고 첫 면부터 적용된다', () => {
    const pages = buildLayout(
      { 1: [block('mark', makeFooterTag('제1장')), block('b1', '⠁')] },
      false,
      '',
      withFooter('수학 I'),
    );
    expect(pages).toHaveLength(1);
    expect(pages[0].footerText).toBe('제1장');
  });

  describe('setSectionFooterBefore', () => {
    const three = [block('A', '가나다'), block('B', '라마바'), block('C', '사아자')];

    it('커서가 있던 블록 앞에 표식을 넣고 본문은 그대로 둔다', () => {
      const r = setSectionFooterBefore(three, 'B', '제3장 함수');
      expect(r.status).toBe('inserted');
      if (r.status !== 'inserted') return;
      expect(r.blocks.map((b) => b.currentText)).toEqual([
        '가나다',
        makeFooterTag('제3장 함수'),
        '라마바',
        '사아자',
      ]);
    });

    it('바로 앞이 이미 꼬리말 표식이면 쌓지 않고 고친다', () => {
      const withMark = [
        block('A', '가나다'),
        block('mark', makeFooterTag('제2장')),
        block('B', '라마바'),
      ];
      const r = setSectionFooterBefore(withMark, 'B', '제3장');
      expect(r.status).toBe('replaced');
      if (r.status !== 'replaced') return;
      expect(r.blocks).toHaveLength(3);
      expect(r.blocks[1].currentText).toBe(makeFooterTag('제3장'));
      // 표식 블록의 id는 그대로 — 서버에 이미 있는 요소를 수정으로 보내야 한다.
      expect(r.blocks[1].id).toBe('mark');
    });

    it('같은 꼬리말을 다시 넣으면 아무것도 하지 않는다', () => {
      const withMark = [block('mark', makeFooterTag('제2장')), block('B', '라마바')];
      expect(setSectionFooterBefore(withMark, 'B', '제2장').status).toBe('already');
    });

    it('빈 값을 주면 그 자리부터 꼬리말을 빼는 표식이 된다', () => {
      const r = setSectionFooterBefore(three, 'B', '');
      expect(r.status === 'inserted' && r.blocks[1].currentText).toBe(
        makeFooterTag(''),
      );
    });

    it('넘겨받은 배열을 건드리지 않는다', () => {
      setSectionFooterBefore(three, 'B', '제3장');
      expect(three.map((b) => b.currentText)).toEqual(['가나다', '라마바', '사아자']);
    });

    it('없는 블록이면 아무것도 하지 않는다', () => {
      expect(setSectionFooterBefore(three, '없음', '제3장').status).toBe('not-found');
    });
  });

  describe('footerMarkBefore', () => {
    it('바로 앞에 걸린 꼬리말을 읽는다 — 우클릭 메뉴가 현재 값을 채우는 데 쓴다', () => {
      const blocks = [block('mark', makeFooterTag('제2장')), block('B', '라마바')];
      expect(footerMarkBefore(blocks, 'B')).toBe('제2장');
    });

    it('표식이 없으면 null이다', () => {
      expect(footerMarkBefore([block('B', '라마바')], 'B')).toBeNull();
    });
  });
});

// 1차 PoC 1-2 기능2 · 1-4 기능1 — 시작 번호 지정.
describe('시작 번호 지정', () => {
  const opts = (over: Partial<typeof DEFAULT_TYPESET>) => ({
    ...DEFAULT_TYPESET,
    ...over,
  });

  it('점자 면 번호를 1이 아닌 데서 시작한다', () => {
    const pages = buildLayout(
      { 1: [block('b1', long), block('b2', long)] },
      false,
      '',
      opts({ startBraillePage: 40, rows: 2 }),
    );
    expect(pages.map((p) => p.braillePage)).toEqual([40, 41]);
  });

  it('기본값은 1면부터', () => {
    const pages = buildLayout({ 1: [block('b1', '⠁')] }, false, '', DEFAULT_TYPESET);
    expect(pages[0].braillePage).toBe(1);
  });

  // QA 2026-09-02: "원본 페이지 번호 시작을 올리면 페이지행의 점자는 바뀌는데
  // 원본 페이지 변경선의 점자는 안 바뀐다." 둘 다 같은 옮긴 번호를 써야 한다.
  it('원본 쪽 번호 시작을 옮기면 변경선 번호도 함께 옮겨진다', () => {
    const pages = buildLayout(
      { 1: [block('b1', '⠁')], 2: [block('b2', '⠃')] },
      true,
      '',
      opts({ origPageStart: 5 }),
    );
    const rows = flattenRows(pages);
    // 두 번째 원본 쪽(=옮기면 6쪽) 앞에 들어가는 변경선.
    const changeLine = rows.find((r) => r.text.startsWith('⠤'));
    expect(changeLine?.text).toBe(
      pageChangeLine(6, { cols: DEFAULT_TYPESET.cols }),
    );
    // 페이지행 왼쪽에도 옮긴 번호(5쪽)가 찍힌다 — 둘이 같은 기준을 쓴다.
    const pageRowText = rows[rows.length - 1].text;
    expect(pageRowText.startsWith('⠼⠑')).toBe(true);
  });

  it('원본 쪽 번호 시작을 옮겨도 편집 좌표는 그대로다', () => {
    const shifted = buildLayout(
      { 7: [block('b1', '⠁')] },
      true,
      '',
      opts({ origPageStart: 100 }),
    );
    // 판면 행의 출처는 서버가 준 원본 쪽(7) 그대로여야 편집이 어긋나지 않는다.
    const body = flattenRows(shifted).find((r) => r.kind === 'body');
    expect(body?.source?.pageNo).toBe(7);
  });
});

// 편집 뒤 커서 자리 — 밀려도 변하지 않는 좌표(블록·논리 줄·칸)로 적어 두고
// 새 판면에서 되찾는다.
describe('커서 앵커', () => {
  const rowsOf = (text: string) =>
    flattenRows(buildLayout({ 1: [block('b1', text)] }, false, '', DEFAULT_TYPESET));
  const cols = DEFAULT_TYPESET.cols;

  it('행의 시작 칸을 더해 논리 줄 전체 기준으로 적는다', () => {
    const rows = rowsOf('⠁'.repeat(cols + 5));
    const second = rows.filter((r) => r.kind === 'body')[1];
    expect(second.source?.offset).toBe(cols);
    expect(anchorAt(second.source!, 3).offset).toBe(cols + 3);
  });

  it('밀린 판면에서도 같은 글자 자리를 찾는다', () => {
    const before = rowsOf('⠁⠃⠉');
    const anchor = anchorAt(before[0].source!, 2); // "⠉" 앞
    // 앞에 논리 줄이 하나 늘어 뒤가 통째로 밀린 판면
    const after = flattenRows(
      buildLayout({ 1: [block('b1', '새 줄\n⠁⠃⠉')] }, false, '', DEFAULT_TYPESET),
    );
    const hit = resolveAnchor(after, { ...anchor, lineIndex: 1 });
    expect(hit).not.toBeNull();
    expect(after[hit!.rowIndex].text).toBe('⠁⠃⠉');
    expect(hit!.cell).toBe(2);
  });

  it('행 끝자리는 이어지는 행의 첫 칸으로 본다', () => {
    const rows = rowsOf('⠁'.repeat(cols + 5));
    const hit = resolveAnchor(rows, {
      blockId: 'b1',
      lineIndex: 0,
      offset: cols, // 첫 행의 끝 = 둘째 행의 시작
    });
    expect(hit).toEqual({ rowIndex: rows.indexOf(rows.filter((r) => r.kind === 'body')[1]), cell: 0 });
  });

  it('이어지는 행이 없으면 그 행의 끝 칸에 둔다', () => {
    const rows = rowsOf('⠁'.repeat(cols));
    const hit = resolveAnchor(rows, { blockId: 'b1', lineIndex: 0, offset: cols });
    expect(hit).toEqual({ rowIndex: 0, cell: cols });
  });

  it('블록이 사라졌으면 null — 호출부가 커서를 그대로 둔다', () => {
    expect(resolveAnchor(rowsOf('⠁'), { blockId: '없음', lineIndex: 0, offset: 0 })).toBeNull();
  });
});
