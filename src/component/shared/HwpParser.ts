import { toJson } from '@ohah/hwpjs';

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

  // 1. JSON 변환 — @ohah/hwpjs는 Node Buffer 시그니처를 요구하지만 브라우저 Uint8Array로도 동작
  const jsonString = toJson(uint8 as unknown as Parameters<typeof toJson>[0]);
  const hwpDoc = JSON.parse(jsonString);

  console.log('HWP Parsed Doc:', hwpDoc);

  // 2. body_text 탐색 (없으면 전체 탐색)
  // 구조상 body_text 안에 sections가 있으므로 여기서 시작하는 것이 효율적입니다.
  if (hwpDoc.body_text) {
    return extractTextFromJson(hwpDoc.body_text).trim();
  }

  return extractTextFromJson(hwpDoc).trim();
};

const extractTextFromJson = (node: any): string => {
  if (!node || typeof node !== 'object') return '';

  let text = '';

  // [핵심 수정] records 배열 내의 para_text 처리
  // 제공해주신 JSON에서 텍스트는 { type: "para_text", text: "..." } 형태입니다.
  if (node.type === 'para_text' && typeof node.text === 'string') {
    return node.text;
  }

  // 기존 로직: 일반 텍스트 노드
  if (node.type === 'text' && typeof node.text === 'string') {
    return node.text;
  }

  // 자식 노드 순회 (sections -> paragraphs -> records 순서)
  text += extractChildrenText(node);

  return text;
};

const extractChildrenText = (node: any): string => {
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
