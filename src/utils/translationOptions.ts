// 점역 옵션 — 1차 PoC(2026-08-26 한국점자도서관) "부가 기능"에서 온 것들.
//
// ⚠ 이 값들은 **아직 서버로 나가지 않는다.** 묵자→점자 변환은 전부 AI 서버가 하고,
//   POST /api/jobs는 지금 mode·insertPageNumber·footerText만 받는다. 모르는 필드를
//   실어 보내면 COMMON4000으로 막히므로, 화면에서 고르고 기기에 저장하는 데까지만
//   해 두고 전송은 서버가 받을 준비가 된 뒤에 잇는다.
//   필요한 계약은 docs/SERVER-REQUIREMENTS-3.3.0.md의 S-1 ~ S-3에 적어 두었다.

/** 점자 등급. 1급 = 정자(약자 없음), 2급 = 약자. */
export type BrailleGrade = 1 | 2;

/**
 * 한국어와 영어가 섞인 문장에서 소괄호 등이 나올 때 어느 규정을 따를지.
 *
 * 1차 PoC 자문(Q1/A1): 앞뒤 단어가 한국어면 한국어 규정, 영어면 영어 규정.
 * **앞뒤가 각각 한국어/영어인 경우는 규정에 없어서** 임의로 하나를 골라야 하고,
 * 그 선택을 사용자가 바꿀 수 있게 해 달라는 요청이 그대로 왔다.
 */
export type MixedScriptRule = 'ko' | 'en';

export interface TranslationOptions {
  grade: BrailleGrade;
  /** 영어 구간에 영어 점자 규정을 적용할지 */
  englishBraille: boolean;
  mixedScriptRule: MixedScriptRule;
}

export const DEFAULT_TRANSLATION: TranslationOptions = {
  // 한국점자도서관은 초등 교과서를 많이 만들어 1급을 더 쓴다. 일반적으로는 2급이
  // 많지만, 이 앱의 첫 사용자가 그쪽이라 1급을 기본으로 둔다(미팅 기록).
  grade: 1,
  englishBraille: false,
  mixedScriptRule: 'ko',
};

export const normalizeTranslation = (
  raw: Partial<TranslationOptions> | null | undefined,
): TranslationOptions => {
  const v = raw ?? {};
  return {
    grade: v.grade === 2 ? 2 : 1,
    englishBraille: v.englishBraille === true,
    mixedScriptRule: v.mixedScriptRule === 'en' ? 'en' : 'ko',
  };
};

export const describeTranslation = (o: TranslationOptions): string =>
  [
    `${o.grade}급 점자`,
    o.englishBraille ? '영어 점자 적용' : '영어도 1급으로',
    `혼용 시 ${o.mixedScriptRule === 'ko' ? '한국어' : '영어'} 규정`,
  ].join(' · ');
