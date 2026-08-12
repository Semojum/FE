// 서버가 내려준 파일(Blob)을 저장한다.
//
// 데스크톱(Tauri)에서는 저장 위치를 사용자가 고른다 — 예전에는 anchor + blob URL로
// webview 기본 다운로드 폴더에 말없이 떨어져, 어디에 저장됐는지도 알 수 없고 폴더를
// 바꿀 수도 없었다 (QA "다운로드 시 파일 저장 폴더 선택 가능하게 변경").
// 브라우저(개발 중 UI 확인용)에서는 종전대로 anchor 방식을 쓴다.

const isTauri = (): boolean =>
  typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

const extensionOf = (fileName: string): string | null => {
  const dot = fileName.lastIndexOf('.');
  return dot > 0 ? fileName.slice(dot + 1) : null;
};

const saveViaAnchor = (blob: Blob, fileName: string): void => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};

/**
 * 저장 위치를 물어보고 파일을 쓴다.
 * 반환값은 실제로 저장한 경로(브라우저 폴백이거나 사용자가 취소하면 null).
 * 취소는 오류가 아니다 — 호출부는 null을 "저장 안 함"으로 다루면 된다.
 */
export const saveBlob = async (
  blob: Blob,
  fileName: string,
): Promise<string | null> => {
  if (!isTauri()) {
    saveViaAnchor(blob, fileName);
    return null;
  }

  const [{ save }, { writeFile }] = await Promise.all([
    import('@tauri-apps/plugin-dialog'),
    import('@tauri-apps/plugin-fs'),
  ]);

  const ext = extensionOf(fileName);
  const path = await save({
    defaultPath: fileName,
    filters: ext
      ? [{ name: `${ext.toUpperCase()} 파일`, extensions: [ext] }]
      : undefined,
  });
  if (!path) return null; // 사용자가 취소

  await writeFile(path, new Uint8Array(await blob.arrayBuffer()));
  return path;
};
