import { toJson } from '@ohah/hwpjs';

// hwpjs JSON 출력 노드의 최소 구조. 라이브러리가 타입을 노출하지 않아 직접 선언.
interface HwpNode {
  type?: string;
  text?: string;
  sections?: HwpNode[];
  paragraphs?: HwpNode[];
  records?: HwpNode[];
  children?: HwpNode[];
  body_text?: HwpNode;
}

// ────────────────────────────────────────
// HWPX (ZIP 기반) 파싱
// ────────────────────────────────────────
const parseHwpx = async (file: File): Promise<string> => {
  const { default: JSZip } = await import('jszip');
  const arrayBuffer = await file.arrayBuffer();
  const zip = await JSZip.loadAsync(arrayBuffer);

  const sectionFiles = Object.keys(zip.files)
    .filter((name) => /Contents\/section\d+\.xml/.test(name))
    .sort();

  if (sectionFiles.length === 0) {
    throw new Error('HWPX 섹션 파일을 찾을 수 없습니다.');
  }

  let fullText = '';
  for (const sectionName of sectionFiles) {
    const xmlStr = await zip.files[sectionName].async('string');
    const doc = new DOMParser().parseFromString(xmlStr, 'application/xml');
    doc.querySelectorAll('t').forEach((node) => {
      if (node.textContent) fullText += node.textContent;
    });
    fullText += '\n';
  }

  return fullText.trim();
};

// ────────────────────────────────────────
// OLE2 HWP 파싱 (@ohah/hwpjs 사용)
// ────────────────────────────────────────
const parseOle2Hwp = async (file: File): Promise<string> => {
  const arrayBuffer = await file.arrayBuffer();
  const uint8 = new Uint8Array(arrayBuffer);

  // hwpjs는 Node Buffer 시그니처를 요구하지만 브라우저 Uint8Array로도 동작.
  // 라이브러리 타입이 Buffer만 받도록 좁혀져 있어 캐스트가 필요함.
  const jsonString = toJson(uint8 as unknown as Parameters<typeof toJson>[0]);
  const hwpDoc: HwpNode = JSON.parse(jsonString);

  if (hwpDoc.body_text) {
    return extractTextFromJson(hwpDoc.body_text).trim();
  }

  return extractTextFromJson(hwpDoc).trim();
};

const extractTextFromJson = (node: HwpNode | null | undefined): string => {
  if (!node || typeof node !== 'object') return '';

  // records 내부의 para_text 노드: { type: "para_text", text: "..." }
  if (node.type === 'para_text' && typeof node.text === 'string') {
    return node.text;
  }

  if (node.type === 'text' && typeof node.text === 'string') {
    return node.text;
  }

  return extractChildrenText(node);
};

const extractChildrenText = (node: HwpNode): string => {
  if (!node) return '';
  let text = '';

  // 1. Sections (섹션)
  if (Array.isArray(node.sections)) {
    for (const section of node.sections) {
      text += extractTextFromJson(section);
    }
  }

  // 2. Paragraphs (문단)
  if (Array.isArray(node.paragraphs)) {
    for (const para of node.paragraphs) {
      text += extractTextFromJson(para);
      text += '\n'; // 문단 끝에 줄바꿈 추가
    }
  }

  // 3. [핵심 추가] Records (문단 내부 구성 요소)
  // HWP 5.0 이상 구조에서는 문단 내용이 records 배열에 담깁니다.
  if (Array.isArray(node.records)) {
    for (const record of node.records) {
      text += extractTextFromJson(record);
    }
  }

  // 4. Children (기타 일반적인 구조)
  if (Array.isArray(node.children)) {
    for (const child of node.children) {
      text += extractTextFromJson(child);
    }
  }

  return text;
};
// ────────────────────────────────────────
// 통합 진입점
// ────────────────────────────────────────
export const parseHwpToText = async (file: File): Promise<string> => {
  const arrayBuffer = await file.arrayBuffer();
  const header = new Uint8Array(arrayBuffer.slice(0, 4));

  // HWPX 식별 (PK 헤더)
  const isZip =
    header[0] === 0x50 &&
    header[1] === 0x4b &&
    header[2] === 0x03 &&
    header[3] === 0x04;

  if (isZip) {
    return parseHwpx(file);
  } else {
    return parseOle2Hwp(file);
  }
};
