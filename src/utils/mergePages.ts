import { TranslationBlock } from '../types';

/**
 * 원본 페이지 경계 표식 — **하이픈 40개만 있는 줄**.
 *
 * 모드 b는 올라온 .txt를 30줄씩 잘라 "원본 페이지"를 만든다(Job 생성 명세의 모드별
 * 페이지 분리 표). 다만 이 줄이 들어 있으면 30줄 규칙 대신 이 자리에서 나눈다 —
 * 모드 a의 .txt 다운로드가 원본 쪽 사이에 넣는 것이 바로 이 줄이고, 그래서
 * "모드 a로 내려받아 모드 b에 올리기"에서는 원본 쪽이 그대로 살아난다.
 *
 * ⚠ 서버는 **정확히 이 모양만** 알아본다(2026-09-03 실서버 실측). 하이픈 39개·41개,
 *   em 대시(—), 그리고 줄 끝이 CRLF이면 전부 못 알아보고 30줄 청크로 되돌아간다.
 *   그러니 이 상수를 손보거나 줄 끝을 바꾸지 말 것.
 */
export const ORIG_PAGE_SEPARATOR = '-'.repeat(40);

// 점역으로 보내기 (OCR → 점역 연계)
//
// BE의 `POST /api/jobs/{id}/send-to-braille`은 만들지 않기로 했으므로, FE가 교정된
// 전체 페이지를 하나의 텍스트로 합쳐 모드 b Job으로 재업로드한다(V2와 같은 방식).
// 기능정의서 §4: "페이지 순서는 반드시 보존한다 — 합쳐진 텍스트의 순서가 원문과
// 달라지면 안 된다." 그래서 페이지 번호 오름차순 · 블록 순서 그대로 잇고,
// **쪽 사이에는 위 표식을 넣는다** — 안 넣으면 모드 b가 30줄마다 자르는 바람에
// 원본 쪽 번호도 변경선도 원문과 아무 관계가 없어진다.
//
// ⚠ 평소에는 이 함수 대신 **서버가 만든 .txt를 그대로 올린다**(App의 점역으로 보내기).
//    같은 파일을 손으로 내려받아 올린 것과 한 글자도 다르지 않게 하기 위해서다.
//    여기는 jobId를 모를 때의 대비책이고, 그때도 표식만은 같아야 한다.
export const mergePagesToText = (
  blocksByPage: Record<number, TranslationBlock[]>,
): string =>
  Object.keys(blocksByPage)
    .map(Number)
    .sort((a, b) => a - b)
    .map((page) =>
      (blocksByPage[page] ?? [])
        // 줄 끝이 CRLF면 표식 줄이 "…----\r"가 되어 서버가 못 알아본다.
        .map((block) => block.currentText.replace(/\r\n?/g, '\n').trimEnd())
        .filter((text) => text.trim().length > 0)
        .join('\n'),
    )
    // 내용이 하나도 없는 쪽은 서버도 페이지로 세지 않는다(실측) — 표식만 남겨 두면
    // 빈 줄이 낀 쪽이 하나 생길 뿐이라 그냥 버린다.
    .filter((pageText) => pageText.length > 0)
    .join(`\n${ORIG_PAGE_SEPARATOR}\n`);

// 합친 텍스트를 올릴 때 쓸 파일 이름. 마이페이지에 이 이름으로 남으므로 원본 이름을
// 물려주고 확장자만 .txt로 바꾼다(원본 이름을 모르면 기본 이름).
export const brailleSourceFileName = (originalName?: string | null): string => {
  const base = (originalName ?? '').replace(/\.[^.]+$/, '').trim();
  return `${base || '점역으로 보내기'}.txt`;
};
