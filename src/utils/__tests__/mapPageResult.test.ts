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

  it('drafts/list가 배열이 아닌 값({})으로 와도 throw하지 않는다', () => {
    // 서버가 빈 컬렉션을 [] 대신 {}로 직렬화하는 경우를 모사.
    const result = {
      text_list: {},
      braille_text_list: [
        { id: '1', type: 'text', is_blocked: false, contents: ['⠟'], drafts: {} },
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
        { id: 'a', type: 'title', order: 1, is_blocked: false, contents: ['제목'] },
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
