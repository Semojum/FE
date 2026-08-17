import {
  BlockDraft,
  BoundingBox,
  ConversionTab,
  ImageResolution,
  OriginalTextBlock,
  TABS,
  TranslationBlock,
} from '../types';
import { BoundingBoxDto, Draft, StreamPageResult } from '../types/apiTypes';

// 한 페이지 변환 결과(SSE page_done / 저장된 작업 페이지)를
// 앱 내부 상태 구조로 변환한 결과.
export interface MappedPage {
  blocks: TranslationBlock[];
  bboxes: BoundingBox[];
  originalTexts: OriginalTextBlock[];
  imgResolution?: ImageResolution;
}

// 서버 응답이 명세와 달리 배열이 아닌 값(빈 컬렉션이 {}로 직렬화되는 등)으로 올 수 있어
// 방어적으로 배열만 통과시킨다. `?? []`/`|| []`는 null·undefined만 막고 {}는 못 막는다.
const asArray = <T>(val: T[] | null | undefined): T[] =>
  Array.isArray(val) ? val : [];

// 실서버는 contents의 각 줄을 개행으로 끝맺어 보낸다(예: "  ⠨⠎⠢⠱⠁…⠠⠎\n").
// 이 값을 그대로 join('\n')하면 buildGridLines가 다시 split('\n')할 때 블록마다 빈 줄이
// 하나씩 생겨 격자가 한 줄 걸러 비고, 줄 수가 두 배가 되어 판면 쪽수까지 어긋난다.
// 줄 끝 개행만 벗긴다 — 줄 안쪽 개행은 그대로 줄 구분으로 살려 둔다.
const stripTrailingNewline = (line: string): string =>
  line.replace(/\r?\n$/, '');

const toArray = (val: string[] | string | undefined): string[] => {
  if (Array.isArray(val)) {
    return val
      .filter((v): v is string => typeof v === 'string')
      .map(stripTrailingNewline);
  }
  return typeof val === 'string' ? [stripTrailingNewline(val)] : [];
};

// 한 항목의 contents는 "최종 결과 줄 목록"이다. 줄바꿈으로 이어 한 블록의 본문을 만든다.
// (구버전 content(문자열)도 호환)
const itemContents = (item: {
  contents?: string[];
  content?: string | string[];
}): string[] => toArray(item.contents ?? item.content);

const itemText = (item: { contents?: string[]; content?: string | string[] }) =>
  itemContents(item).join('\n');

// AI가 tn_text/draft.text를 "<!점역자주>...<!/점역자주>" 래퍼로 감싸 보낸다(실서버 확인).
// 화면 표시용 텍스트에서는 래퍼를 벗긴다.
const stripTnWrapper = (
  text: string | null | undefined,
): string | undefined => {
  const stripped = (text ?? '').replace(/<!\/?점역자주>/g, '').trim();
  return stripped.length > 0 ? stripped : undefined;
};

// 실서버는 drafts를 명세(객체 배열)와 달리 JSON 문자열로 이중 인코딩해 보내는 경우가
// 있다(예: "[{\"text\":...}]"). 문자열이면 파싱을 시도해 배열로 복원한다.
const parseDrafts = (drafts: Draft[] | string | null | undefined): Draft[] => {
  if (typeof drafts === 'string') {
    try {
      return asArray(JSON.parse(drafts) as Draft[]);
    } catch {
      return [];
    }
  }
  return asArray(drafts);
};

// 대체 텍스트 후보는 contents의 여러 줄이 아니라 drafts에서 온다(시각 요소에만 존재).
// 라벨(방식명)과 묵자 원문을 유지한 채 매핑해 피커가 탭·묵자·점자를 나눠 그릴 수 있게 한다.
const itemDrafts = (item: { drafts?: Draft[] | string | null }): BlockDraft[] =>
  parseDrafts(item.drafts)
    .map((d) => {
      // 본문과 마찬가지로 구버전 content(문자열)도 받는다.
      const contents = itemContents(
        d as { contents?: string[]; content?: string },
      ).join('\n');
      // text = 묵자 원문(점역자주 래퍼를 벗긴 값), contents = 점자 줄 목록.
      const printText = stripTnWrapper(d.text);
      if (contents) return { label: d.label, printText, content: contents };
      // 실서버는 점자가 없는 모드(a)에서 contents를 빈 배열로 두고 초안 본문을 text에
      // 담아 보낸다 (2026-08-09 실측: {label:"짧은 제목", text:"그림: …", contents:[]}).
      // 그때는 묵자가 곧 적용될 본문이다 — 예전에는 contents만 읽어 초안이 전부
      // 걸러졌고, 그래서 대체 초안 메뉴가 늘 비활성이었다.
      return { label: d.label, printText: undefined, content: printText ?? '' };
    })
    .filter((d) => d.content.length > 0);

const itemCandidates = (item: { drafts?: Draft[] | string | null }): string[] =>
  itemDrafts(item).map((d) => d.content);

const mapBoundingBoxes = (list: BoundingBoxDto[] | undefined): BoundingBox[] =>
  asArray(list).map((b) => ({
    id: String(b.id),
    x: b.x,
    y: b.y,
    x2: b.x2,
    y2: b.y2,
  }));

const mapOriginalTexts = (
  list: StreamPageResult['text_list'],
): OriginalTextBlock[] =>
  asArray(list).map((t) => ({
    id: String(t.id),
    content: itemText(t),
  }));

// 모드(activeTab)별로 채워지는 필드가 다르다.
//  - a(OCR):        text_list + bbox, contents는 후보 배열
//  - b(점역):       text_list(원본) + braille_text_list(결과)
//  - c(통합):       braille_text_list + bbox
export const mapPageResult = (
  activeTab: ConversionTab,
  result: StreamPageResult,
): MappedPage => {
  const imgResolution = result.image_resolution;

  // [CASE C] 통합 변환 (이미지 → 점자)
  if (activeTab === TABS.INTEGRATED) {
    const bboxes = mapBoundingBoxes(result.bounding_box_list);
    const blocks: TranslationBlock[] = asArray(result.braille_text_list).map(
      (item) => {
        const matchedBBox = bboxes.find(
          (b) => String(b.id) === String(item.id),
        );
        return {
          id: String(item.id),
          originalText: '',
          currentText: itemText(item),
          candidates: itemCandidates(item),
          drafts: itemDrafts(item),
          tnText: stripTnWrapper(item.tn_text),
          bbox: matchedBBox,
          isBlocked: item.is_blocked,
          ruleTrail: item.rule_trail,
        };
      },
    );
    return { blocks, bboxes, originalTexts: [], imgResolution };
  }

  // [CASE B] 점역 변환 (텍스트 → 점자)
  if (activeTab === TABS.BRAILLE) {
    const originalTexts = mapOriginalTexts(result.text_list);
    const blocks: TranslationBlock[] = asArray(result.braille_text_list).map(
      (item) => {
        const originalItem = asArray(result.text_list).find(
          (t) => String(t.id) === String(item.id),
        );
        return {
          id: String(item.id),
          originalText: originalItem ? itemText(originalItem) : '',
          currentText: itemText(item),
          candidates: itemCandidates(item),
          drafts: itemDrafts(item),
          tnText: stripTnWrapper(item.tn_text),
          bbox: undefined,
          isBlocked: item.is_blocked,
          ruleTrail: item.rule_trail,
        };
      },
    );
    return { blocks, bboxes: [], originalTexts, imgResolution };
  }

  // [CASE A] OCR 변환 (이미지 → 텍스트)
  const bboxes = mapBoundingBoxes(result.bounding_box_list);
  const originalTexts = mapOriginalTexts(result.text_list);
  const blocks: TranslationBlock[] = asArray(result.text_list).map((item) => {
    const matchedBBox = bboxes.find((b) => String(b.id) === String(item.id));
    const text = itemText(item);
    // OcrTextItem만 is_blocked/rule_trail/drafts를 가진다 (PlainTextItem에는 없음)
    const ocr = item as {
      is_blocked?: boolean;
      rule_trail?: TranslationBlock['ruleTrail'];
      drafts?: Draft[] | string | null;
      tn_text?: string | null;
    };
    return {
      id: String(item.id),
      originalText: text,
      currentText: text,
      candidates: itemCandidates(ocr),
      drafts: itemDrafts(ocr),
      tnText: stripTnWrapper(ocr.tn_text),
      bbox: matchedBBox,
      isBlocked: ocr.is_blocked,
      ruleTrail: ocr.rule_trail,
    };
  });
  return { blocks, bboxes, originalTexts, imgResolution };
};
