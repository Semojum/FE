import {
  buildPagesFromJob,
  DEFAULT_OPTIONS,
  type Job,
} from '@semojum/braille-assist';
import { TranslationBlock } from '../types';

// 결과 패널 격자의 조판 모델.
//
// 조판 규칙(32칸 줄바꿈 · 원본 쪽 변경선 · 26줄 면 나눔 · 페이지행 · 걸침 알파벳)은
// 전부 Semojum/braille-assist가 소유한다. FE는 규칙을 다시 구현하지 않고 그 출력을
// 그대로 그린다 — 그래서 에디터 화면이 다운로드 .brf와 같은 모양이 된다.
// (실측: 페이지 조회 응답을 buildBrf에 넣으면 BE 다운로드 파일과 78줄 전부 일치)
//
// ⚠ 꼬리말은 화면에 뜨지 않는다. braille-assist는 "이미 점역된" 꼬리말을 받는데,
//   묵자→점자 변환은 AI 서버가 하고 페이지 조회 응답에 점역된 꼬리말이 없다.
//   그래서 화면 페이지행은 원본 쪽번호와 점자 면 번호만 채운다(다운로드 파일에는 들어간다).

// 면 규격도 라이브러리 값을 그대로 쓴다(32칸 × 26줄).
export const CELLS_PER_ROW = DEFAULT_OPTIONS.cols;
export const ROWS_PER_PAGE = DEFAULT_OPTIONS.rows;

// 줄의 출처 — 저장은 여전히 원본 페이지 단위(PUT .../pages/{pageNo}/elements)이므로
// 어느 페이지의 어느 블록 몇 번째 줄의 몇 번째 칸부터인지를 들고 있는다.
export interface RowSource {
  pageNo: number;
  blockId: string;
  // 블록 본문 안에서 몇 번째 논리 줄인지 (블록 텍스트를 '\n'으로 나눈 인덱스)
  lineIndex: number;
  // 그 논리 줄에서 이 행이 시작하는 칸 — 32칸을 넘겨 접힌 행이면 32, 64…
  offset: number;
  isBlocked?: boolean;
  hasDrafts?: boolean;
}

// 판면의 한 행.
// body — 점역사가 고칠 수 있는 본문 행
// fixed — 라이브러리가 만든 행(원본 쪽 변경선 · 페이지행). 편집 대상이 아니다
// pad   — 면을 26줄로 채우는 빈 행
export type RowKind = 'body' | 'fixed' | 'pad';

export interface LayoutRow {
  kind: RowKind;
  text: string;
  source?: RowSource;
}

export interface LayoutPage {
  // 점자 면 번호 (1부터)
  braillePage: number;
  rows: LayoutRow[];
}

// 블록 하나가 논리 줄 여러 개로 쪼개진 것 — 조판에 넣기 전의 평평한 목록.
interface LogicalLine extends Omit<RowSource, 'offset'> {
  text: string;
}

const PUA_START = 0xe000;
const PUA_SIZE = 0xf8ff - 0xe000 + 1;

const isMarker = (ch: string): boolean => {
  const cp = ch.codePointAt(0) ?? 0;
  return cp >= PUA_START && cp < PUA_START + PUA_SIZE;
};

// 논리 줄 번호를 사용자 문자와 절대 겹치지 않는 사용자 지정 영역 문자로 바꾼다.
// 조판은 문자열 "길이"와 개행 위치만 보므로, 같은 길이의 표식으로 한 번 더 돌리면
// 똑같은 배치가 나오고 각 행이 어느 논리 줄에서 왔는지 읽어낼 수 있다.
const markerFor = (lineIdx: number): string =>
  String.fromCodePoint(PUA_START + (lineIdx % PUA_SIZE));

// 표식 문자 → 논리 줄 번호. lineIdx가 PUA_SIZE를 넘어가면 값이 겹치므로
// "지금까지 처리한 줄 이후"에서 가장 가까운 후보를 고른다(행은 항상 순서대로 나온다).
const decodeMarker = (ch: string, notBefore: number): number => {
  const raw = (ch.codePointAt(0) ?? PUA_START) - PUA_START;
  const base = Math.floor(notBefore / PUA_SIZE) * PUA_SIZE + raw;
  return base < notBefore ? base + PUA_SIZE : base;
};

const flattenLogicalLines = (
  blocksByPage: Record<number, TranslationBlock[]>,
): LogicalLine[] => {
  const lines: LogicalLine[] = [];
  for (const pageNo of Object.keys(blocksByPage)
    .map(Number)
    .sort((a, b) => a - b)) {
    for (const block of blocksByPage[pageNo] ?? []) {
      // 빈 블록도 한 줄을 차지한다(빈 줄로 보여야 편집할 수 있다).
      block.currentText.split('\n').forEach((text, lineIndex) => {
        lines.push({
          pageNo,
          blockId: block.id,
          lineIndex,
          text,
          isBlocked: block.isBlocked,
          hasDrafts: (block.drafts?.length ?? 0) > 0,
        });
      });
    }
  }
  return lines;
};

// 논리 줄 목록 → braille-assist가 받는 조립 JSON.
// 블록들은 join('')으로 이어붙여지므로 각 논리 줄이 자기 개행을 들고 나가야 한다.
const toJob = (
  lines: LogicalLine[],
  insertPageNumber: boolean,
  footerBraille: string,
  render: (line: LogicalLine, idx: number) => string,
): Job => {
  const pages: Job['pages'] = [];
  lines.forEach((line, idx) => {
    let page = pages[pages.length - 1];
    if (!page || page.orig_page_no !== line.pageNo) {
      page = { orig_page_no: line.pageNo, elements: [] };
      pages.push(page);
    }
    page.elements.push({ text: `${render(line, idx)}\n` });
  });
  return {
    options: { include_page_number: insertPageNumber },
    footer_braille: footerBraille,
    start_braille_page: 1,
    pages,
  };
};

/**
 * 블록들을 점자 판면으로 조판한다.
 *
 * braille-assist를 두 번 돌린다 — 한 번은 실제 점자로(화면에 그릴 내용), 한 번은
 * 같은 길이의 표식 문자로(각 행의 출처). 조판이 길이와 개행만 보기 때문에 두 결과의
 * 행 배치가 정확히 같고, 표식 쪽을 읽으면 어느 행이 본문이고 어느 행이 라이브러리가
 * 만든 줄(변경선·페이지행)인지, 본문이라면 어느 블록 몇 번째 칸부터인지 알 수 있다.
 * 조판 규칙을 FE가 한 줄도 다시 구현하지 않기 위한 방법이다.
 *
 * footerBraille — **이미 점역된** 꼬리말. braille-assist는 점역을 하지 않고 배치만 한다
 * (묵자→점자는 AI 서버 담당). 페이지 조회 응답에 이 값이 아직 없어 지금은 빈 문자열이
 * 들어가고, 그래서 화면 페이지행의 꼬리말 자리만 비어 보인다(다운로드 파일은 정상).
 * BE가 응답에 점역된 꼬리말을 실어 주면 여기로 넘기기만 하면 된다.
 */
export const buildLayout = (
  blocksByPage: Record<number, TranslationBlock[]>,
  insertPageNumber: boolean,
  footerBraille = '',
): LayoutPage[] => {
  const logical = flattenLogicalLines(blocksByPage);
  if (logical.length === 0) return [];

  const real = buildPagesFromJob(
    toJob(logical, insertPageNumber, footerBraille, (l) => l.text),
  );
  const marked = buildPagesFromJob(
    toJob(logical, insertPageNumber, footerBraille, (l, idx) =>
      markerFor(idx).repeat([...l.text].length),
    ),
  );

  // 표식 행을 순서대로 읽으며 본문 행에 출처를 붙인다.
  let started = 0; // 아직 시작하지 않은 논리 줄 번호
  let lastIdx = 0; // 마지막으로 본 논리 줄 번호 (표식 복원 기준점)
  const rowsSeen = new Map<number, number>(); // 논리 줄 → 지금까지 그린 행 수

  return real.map((rowTexts, pageIdx) => ({
    braillePage: pageIdx + 1,
    rows: rowTexts.map((text, rowIdx): LayoutRow => {
      const mark = marked[pageIdx]?.[rowIdx] ?? '';
      const head = [...mark][0];

      if (head && isMarker(head)) {
        const idx = decodeMarker(head, lastIdx);
        lastIdx = idx;
        started = idx + 1;
        const seen = rowsSeen.get(idx) ?? 0;
        rowsSeen.set(idx, seen + 1);
        const { text: _t, ...src } = logical[idx];
        return { kind: 'body', text, source: { ...src, offset: seen * CELLS_PER_ROW } };
      }

      // 표식이 없는 행: 라이브러리가 만든 줄이거나(변경선·페이지행) 빈 줄이다.
      if (mark !== '') return { kind: 'fixed', text };

      // 빈 행 — 아직 안 그린 논리 줄이 마침 빈 줄이면 그 줄이고, 아니면 면을 채우는 여백이다.
      if (started < logical.length && logical[started].text === '') {
        const { text: _t, ...src } = logical[started];
        started += 1;
        lastIdx = started - 1;
        return { kind: 'body', text, source: { ...src, offset: 0 } };
      }
      return { kind: 'pad', text };
    }),
  }));
};

// 격자는 면을 넘나들며 한 줄씩 움직이므로 전체 행을 평평하게 편 목록도 함께 쓴다.
export const flattenRows = (pages: LayoutPage[]): LayoutRow[] =>
  pages.flatMap((p) => p.rows);

// 원본 파일 페이지의 첫 본문 행이 몇 번째인지 — 페이지를 넘겼을 때 그 지점으로
// 스크롤해 원본과 결과의 대조를 유지한다.
export const firstRowIndexOfPage = (
  rows: LayoutRow[],
  pageNo: number,
): number => {
  const idx = rows.findIndex((r) => r.source?.pageNo === pageNo);
  return idx === -1 ? 0 : idx;
};

/**
 * 한 행을 고친 결과를 그 행이 속한 블록의 본문으로 되돌린다.
 * 접힌 행이면 논리 줄의 해당 구간만 갈아 끼운다 — 길어지면 다음 행으로 다시 접힌다.
 */
export const blockTextWithRowEdit = (
  blockText: string,
  source: RowSource,
  oldRowText: string,
  newRowText: string,
): string => {
  const lines = blockText.split('\n');
  const logical = [...(lines[source.lineIndex] ?? '')];
  const before = logical.slice(0, source.offset).join('');
  const after = logical.slice(source.offset + [...oldRowText].length).join('');
  lines[source.lineIndex] = `${before}${newRowText}${after}`;
  return lines.join('\n');
};
