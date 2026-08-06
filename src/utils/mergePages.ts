import { TranslationBlock } from '../types';

// 점역으로 보내기 (OCR → 점역 연계)
//
// BE의 `POST /api/jobs/{id}/send-to-braille`은 만들지 않기로 했으므로, FE가 교정된
// 전체 페이지를 하나의 텍스트로 합쳐 모드 b Job으로 재업로드한다(V2와 같은 방식).
// 기능정의서 §4: "페이지 순서는 반드시 보존한다 — 합쳐진 텍스트의 순서가 원문과
// 달라지면 안 된다." 그래서 페이지 번호 오름차순 · 블록 순서 그대로 잇는다.
export const mergePagesToText = (
  blocksByPage: Record<number, TranslationBlock[]>,
): string =>
  Object.keys(blocksByPage)
    .map(Number)
    .sort((a, b) => a - b)
    .flatMap((page) => blocksByPage[page] ?? [])
    .map((block) => block.currentText.trimEnd())
    .filter((text) => text.trim().length > 0)
    .join('\n');

// 합친 텍스트를 올릴 때 쓸 파일 이름. 마이페이지에 이 이름으로 남으므로 원본 이름을
// 물려주고 확장자만 .txt로 바꾼다(원본 이름을 모르면 기본 이름).
export const brailleSourceFileName = (originalName?: string | null): string => {
  const base = (originalName ?? '').replace(/\.[^.]+$/, '').trim();
  return `${base || '점역으로 보내기'}.txt`;
};
