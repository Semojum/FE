import { describe, it, expect } from 'vitest';
import { mapPageResult } from '../mapPageResult';
import { TABS } from '../../types';
import { StreamPageResult } from '../../types/apiTypes';

describe('mapPageResult', () => {
  // 명세: contents는 "최종 결과 줄 목록"이다. 여러 줄이 후보가 아니라
  // 한 블록의 본문(줄바꿈으로 이어짐)이어야 한다. 후보는 drafts에서 온다.
  it('점역(b): 여러 줄 contents를 한 블록 본문으로 합치고, 후보로 새지 않는다', () => {
    const result: StreamPageResult = {
      text_list: [{ id: '1', contents: ['원본 첫 줄', '원본 둘째 줄'] }],
      braille_text_list: [
        {
          id: '1',
          type: 'text',
          is_blocked: false,
          contents: ['⠟⠈⠿', '⠍⠐⠕⠺'],
          drafts: [],
        },
      ],
    };

    const { blocks } = mapPageResult(TABS.BRAILLE, result);

    expect(blocks).toHaveLength(1);
    expect(blocks[0].currentText).toBe('⠟⠈⠿\n⠍⠐⠕⠺');
    expect(blocks[0].originalText).toBe('원본 첫 줄\n원본 둘째 줄');
    // 여러 줄이 대체 텍스트 후보로 쌓이면 안 된다 (drafts가 비었으므로 후보 없음)
    expect(blocks[0].candidates).toEqual([]);
  });

  // 실서버는 contents의 각 줄을 개행으로 끝맺어 보낸다("…⠠⠎\n"). 이걸 그대로 두면
  // buildGridLines가 split('\n')할 때 블록마다 빈 줄이 하나씩 생겨 격자가 한 줄 걸러 빈다.
  it('실서버: 줄 끝 개행을 벗겨 격자에 빈 줄이 생기지 않게 한다', () => {
    const result: StreamPageResult = {
      text_list: [{ id: '1', contents: ['원본 한 줄\n'] }],
      braille_text_list: [
        {
          id: '1',
          type: 'text',
          is_blocked: false,
          contents: ['  ⠨⠎⠢⠱⠁⠀⠘⠡⠚⠧\n'],
          drafts: [],
        },
      ],
    };

    const { blocks } = mapPageResult(TABS.BRAILLE, result);

    expect(blocks[0].currentText).toBe('  ⠨⠎⠢⠱⠁⠀⠘⠡⠚⠧');
    expect(blocks[0].currentText.split('\n')).toHaveLength(1);
    expect(blocks[0].originalText).toBe('원본 한 줄');
  });

  it('실서버: 줄 안쪽 개행은 줄 구분으로 살려 둔다', () => {
    const result: StreamPageResult = {
      braille_text_list: [
        {
          id: '1',
          type: 'text',
          is_blocked: false,
          contents: ['⠟⠈⠿\n⠍⠐⠕⠺\n'],
          drafts: [],
        },
      ],
    };

    const { blocks } = mapPageResult(TABS.BRAILLE, result);

    expect(blocks[0].currentText).toBe('⠟⠈⠿\n⠍⠐⠕⠺');
  });

  it('점역(b): 시각 요소의 drafts가 대체 텍스트 후보가 된다', () => {
    const result: StreamPageResult = {
      braille_text_list: [
        {
          id: 't1',
          type: 'table',
          is_blocked: false,
          contents: ['⠨⠕'],
          selected_idx: 0,
          drafts: [
            { label: '격자형', contents: ['⠨⠕', '⠈⠁'] },
            { label: '행↔열 전치', contents: ['⠠⠍'] },
          ],
        },
      ],
    };

    const { blocks } = mapPageResult(TABS.BRAILLE, result);

    expect(blocks[0].currentText).toBe('⠨⠕');
    expect(blocks[0].candidates).toEqual(['⠨⠕\n⠈⠁', '⠠⠍']);
  });

  it('draft가 contents 대신 content(문자열)로 와도 후보로 살린다', () => {
    // 본문(contents/content)과 같은 구버전 호환. 예전에는 contents만 읽어서
    // 이런 응답이면 후보가 전부 걸러지고 대체 초안 메뉴가 늘 비활성이었다.
    const result = {
      braille_text_list: [
        {
          id: 't1',
          type: 'table',
          is_blocked: false,
          contents: ['⠨⠕'],
          drafts: [{ label: '격자형', content: '⠨⠕' }],
        },
      ],
    } as unknown as StreamPageResult;

    const { blocks } = mapPageResult(TABS.BRAILLE, result);

    expect(blocks[0].drafts).toEqual([
      { label: '격자형', text: undefined, content: '⠨⠕' },
    ]);
    expect(blocks[0].candidates).toEqual(['⠨⠕']);
  });

  it('실서버: contents가 비고 text에 초안 본문이 오면 그것을 후보로 쓴다', () => {
    // 2026-08-09 mode a 실측 응답 형태. 예전에는 contents만 읽어 4개 초안이
    // 전부 걸러졌고, 그래서 대체 초안 메뉴가 항상 비활성이었다.
    const result = {
      text_list: [
        {
          id: 'img1',
          type: 'image',
          order: 1,
          is_blocked: false,
          contents: ['<!점역자주>그림: 건국대학교 상징 문장<!/점역자주>'],
          selected_idx: 2,
          drafts: [
            { label: '생략', text: '그림 생략', contents: [] },
            {
              label: '짧은 제목',
              text: '그림: 건국대학교 상징 문장',
              contents: [],
            },
          ],
        },
      ],
    } as unknown as StreamPageResult;

    const { blocks } = mapPageResult(TABS.OCR, result);

    expect(blocks[0].drafts).toEqual([
      { label: '생략', text: undefined, content: '그림 생략' },
      {
        label: '짧은 제목',
        text: undefined,
        content: '그림: 건국대학교 상징 문장',
      },
    ]);
    expect(blocks[0].candidates).toHaveLength(2);
  });

  it('drafts/list가 배열이 아닌 값({})으로 와도 throw하지 않는다', () => {
    // 서버가 빈 컬렉션을 [] 대신 {}로 직렬화하는 경우를 모사.
    const result = {
      text_list: {},
      braille_text_list: [
        {
          id: '1',
          type: 'text',
          is_blocked: false,
          contents: ['⠟'],
          drafts: {},
        },
      ],
    } as unknown as StreamPageResult;

    expect(() => mapPageResult(TABS.BRAILLE, result)).not.toThrow();
    const { blocks } = mapPageResult(TABS.BRAILLE, result);
    expect(blocks[0].currentText).toBe('⠟');
    expect(blocks[0].candidates).toEqual([]);
  });

  it('실서버: JSON 문자열로 이중 인코딩된 drafts를 파싱한다', () => {
    // 실서버(mode c 시각 요소)가 drafts를 "[{...}]" 문자열로 보내는 것을 확인함.
    const result = {
      braille_text_list: [
        {
          id: 'v1',
          type: 'chart_graph',
          is_blocked: false,
          tn_text: '<!점역자주>그래프: 막대 네 개.<!/점역자주>',
          contents: ['⠠⠄⠈⠪'],
          drafts: JSON.stringify([
            {
              label: '수학적 서술',
              text: '<!점역자주>그래프: 막대 네 개.<!/점역자주>',
              contents: ['⠠⠄⠈⠪', '⠐⠗⠙⠪'],
            },
          ]),
        },
      ],
    } as unknown as StreamPageResult;

    const { blocks } = mapPageResult(TABS.INTEGRATED, result);

    expect(blocks[0].tnText).toBe('그래프: 막대 네 개.');
    expect(blocks[0].drafts).toEqual([
      {
        label: '수학적 서술',
        text: '그래프: 막대 네 개.',
        content: '⠠⠄⠈⠪\n⠐⠗⠙⠪',
      },
    ]);
    expect(blocks[0].candidates).toEqual(['⠠⠄⠈⠪\n⠐⠗⠙⠪']);
  });

  it('실서버: 깨진 drafts 문자열은 무시하고 throw하지 않는다', () => {
    const result = {
      braille_text_list: [
        {
          id: 'v2',
          type: 'image',
          is_blocked: false,
          contents: ['⠟'],
          drafts: 'not-json{{{',
        },
      ],
    } as unknown as StreamPageResult;

    expect(() => mapPageResult(TABS.INTEGRATED, result)).not.toThrow();
    expect(mapPageResult(TABS.INTEGRATED, result).blocks[0].candidates).toEqual(
      [],
    );
  });

  it('OCR(a): 여러 텍스트 항목이 각각 별도 블록이 된다', () => {
    const result: StreamPageResult = {
      image_resolution: { width: 2480, height: 3505 },
      text_list: [
        {
          id: 'a',
          type: 'title',
          order: 1,
          is_blocked: false,
          contents: ['제목'],
        },
        {
          id: 'b',
          type: 'text',
          order: 2,
          is_blocked: false,
          contents: ['본문 한 줄', '본문 두 줄'],
        },
      ],
    };

    const { blocks } = mapPageResult(TABS.OCR, result);

    expect(blocks).toHaveLength(2);
    expect(blocks[1].currentText).toBe('본문 한 줄\n본문 두 줄');
    expect(blocks[1].candidates).toEqual([]);
  });
});
