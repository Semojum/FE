// 구간 꼬리말 임시 점역 — **임시 경로. L-3이 열리면 통째로 지운다.**
//
// 왜 있는가
// ---------
// 작업 전체 꼬리말은 업로드 때 BE가 AI `TranslateText`로 점역해 `footerBraille`로
// 내려주고, 그 값이 판면 페이지행에 그대로 찍힌다(2026-09-03). 그런데 구간 꼬리말
// (`<!꼬리말:제3장 함수>`)은 점역사가 **판면 편집 중에** 만드는 문구라 그 길을 타지
// 못한다 — 표식은 `PUT .../elements`로 서버에 도착하지만 BE가 해석하지 않는다
// (docs/SERVER-REQUIREMENTS-3.3.0.md L-3). 그래서 라이브러리에 넘길 점자가 없어
// 화면에서는 배지로만 보여 주고 있었고, "꼬리말 수정 적용범위"를 QA할 수 없었다.
//
// 그 QA를 지금 돌릴 수 있게 외부 점역기(braillify.kr)를 임시로 끼운다.
//
// 무엇을 믿을 수 있고 무엇을 믿을 수 없나 (2026-09-03 AI 서버와 6건 대조)
// ---------------------------------------------------------------------
//   한글·숫자만 → 글자까지 같다.
//     제3장 함수 · 부록 · 수학 익힘책 1 · 3-1 이차방정식의 풀이 모두 일치.
//   영문이 섞이면 → 다르다.
//     "Chapter 3 Algebra"에 AI는 로마자 표시 ⠴를 앞에 붙이는데 이쪽은 안 붙인다.
//   로마 숫자 등 → 거절한다.
//     "Ⅱ. 문학의 갈래와 역사"는 HTTP 400.
//
// 그리고 무엇보다, **이 값은 화면에만 들어간다.** 내려받는 .brf는 BE가 만들고 BE는
// 구간 꼬리말 표식을 모르므로 파일에는 여전히 표식이 글자로 찍힌다. 화면과 파일이
// 어긋나는 상태를 하나 더 만드는 셈이지만, 그래도 지금 쓸 수 있는 편이 낫다고
// 판단해 프로덕션까지 연다(2026-09-03 결정). 대신 구간 꼬리말을 넣는 자리에서
// "파일에는 아직 안 들어간다"를 화면으로 알린다(SectionFooterModal).
//
// 바깥으로 나가는 요청이다 — 꼬리말 문구(보통 단원명)가 이 서비스로 전송된다.
// 문서 본문은 보내지 않는다.
//
// 왜 httpFetch를 안 쓰나
// ---------------------
// 데스크톱(Tauri)의 http 플러그인 스코프에는 semojum.app·S3·GCS만 올라가 있어
// (src-tauri/capabilities/default.json) 이 호스트는 막힌다. 이쪽은
// `access-control-allow-origin: *`이라 웹뷰 fetch로 그냥 나간다 — 임시 코드가
// 앱 권한을 건드리지 않게 전역 fetch를 직접 쓴다.

const ENDPOINT = 'https://api.braillify.kr/braille';

// IP당 60req/60s. 꼬리말은 문서당 몇 개뿐이라 여유롭지만, 한꺼번에 쏟지 않도록
// 순서대로 부른다.
const timeoutMs = 8000;

/**
 * 묵자 한 줄 → 점자. 못 바꾸면 null(로마 숫자처럼 거절되는 글자가 있다).
 * 호출부는 null을 "이 꼬리말은 화면에 못 찍는다"로 다루면 된다.
 */
export const translateFooterText = async (
  text: string,
): Promise<string | null> => {
  const trimmed = text.trim();
  if (!trimmed) return '';
  try {
    const res = await fetch(`${ENDPOINT}?text=${encodeURIComponent(trimmed)}`, {
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) return null;
    const data: unknown = await res.json();
    const braille = (data as { braille?: unknown })?.braille;
    return typeof braille === 'string' ? braille : null;
  } catch {
    return null;
  }
};

/**
 * 여러 문구를 한 번에. 실패한 문구도 키를 남긴다(값 null) — 호출부가 "아직 안 물어본
 * 것"과 "물어봤는데 안 되는 것"을 가려 같은 문구를 무한히 다시 묻지 않게 한다.
 */
export const translateFooterTexts = async (
  texts: readonly string[],
): Promise<Record<string, string | null>> => {
  const out: Record<string, string | null> = {};
  for (const text of texts) out[text] = await translateFooterText(text);
  return out;
};
