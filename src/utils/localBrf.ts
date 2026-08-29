// 화면 판면을 그대로 .brf로 — **서버가 조판 설정을 받기 전까지의 임시 경로**.
//
// 왜 있는가: 다운로드 파일은 BE가 만들고, BE는 Job에 저장된 값만 쓴다. 지금
// `POST /api/jobs`가 받는 조판 값은 `insertPageNumber` 하나뿐이라
// (docs/SERVER-REQUIREMENTS-3.3.0.md S-1) 규격을 40칸으로 바꾸거나 쪽바꿈·구간
// 꼬리말을 넣어도 **화면과 받은 파일이 다르다.** 그 차이를 눈으로 확인하고 현장
// 시험을 계속할 수 있도록, 개발 빌드에서만 화면 판면을 그대로 파일로 떨군다.
//
// ⚠ 이것은 서버 다운로드를 대신하지 않는다.
//  · 꼬리말은 비어 있다 — 묵자→점자 점역은 AI 서버 몫이고 FE에는 점역기가 없다(S-4).
//  · 표식(`<!쪽바꿈>`·`<!꼬리말:…>`)은 판면에서 이미 걷혀 있으므로 파일에도 안 들어간다.
//    반대로 **서버가 만든 파일에는 글자로 찍힌다**(L-2·L-3).
//  · 조판 자체는 braille-assist가 한 결과를 그대로 옮길 뿐, FE가 규칙을 다시 짜지 않는다.
//
// S-1이 열리면 이 파일과 호출부를 통째로 지운다.

import { toBrfAscii } from '@semojum/braille-assist';
import { footerTagOf, isPageBreakLine, type LayoutPage } from './brailleLayout';
import type { TranslationBlock } from '../types';

/** 판면(면 → 행)을 BRF-ASCII 본문으로. 행 하나가 파일 한 줄이다. */
export const brfFromLayout = (pages: LayoutPage[]): string =>
  pages
    .flatMap((page) => page.rows.map((row) => row.text))
    .map(toBrfAscii)
    .join('\n');

/** 서버가 아직 해석하지 못하는 표식 수 — 다운로드 전에 알린다(L-2·L-3). */
export interface PendingMarks {
  pageBreaks: number;
  footerMarks: number;
}

export const countPendingMarks = (
  blocksByPage: Record<number, TranslationBlock[]>,
): PendingMarks => {
  let pageBreaks = 0;
  let footerMarks = 0;
  for (const blocks of Object.values(blocksByPage)) {
    for (const b of blocks) {
      if (isPageBreakLine(b.currentText)) pageBreaks += 1;
      else if (footerTagOf(b.currentText) !== null) footerMarks += 1;
    }
  }
  return { pageBreaks, footerMarks };
};
