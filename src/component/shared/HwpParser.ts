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
// OLE2 HWP 파싱 (hwp.js 사용 — 순수 JS라 macOS/Windows 동일 동작)
// ────────────────────────────────────────
const parseOle2Hwp = async (file: File): Promise<string> => {
  // hwp.js는 cfb/pako를 내부 번들로 포함한 순수 JS 라이브러리라
  // 네이티브/wasm 바이너리가 없어 플랫폼(OS·CPU)에 의존하지 않는다.
  const { parse } = await import('hwp.js');

  const arrayBuffer = await file.arrayBuffer();
  const uint8 = new Uint8Array(arrayBuffer);

  // hwp.js는 내부적으로 cfb.read(input, options)를 호출한다.
  // options.type을 지정하지 않으면 입력을 base64 문자열로 오해하므로
  // 'array'를 줘서 Uint8Array를 바이트 배열 그대로 파싱하게 한다.
  const doc = parse(uint8, { type: 'array' });

  let fullText = '';
  for (const section of doc.sections) {
    for (const paragraph of section.content) {
      for (const char of paragraph.content) {
        // 일반 문자는 value가 string, 제어 문자(개행 등)는 number다.
        if (typeof char.value === 'string') {
          fullText += char.value;
        }
      }
      fullText += '\n'; // 문단 끝에 줄바꿈
    }
  }

  return fullText.trim();
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
