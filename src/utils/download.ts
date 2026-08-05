// 서버가 내려준 파일(Blob)을 사용자의 다운로드 폴더로 저장한다.
// 데스크톱(Tauri) webview에서도 anchor + blob URL 방식이 그대로 동작한다.
export const saveBlob = (blob: Blob, fileName: string): void => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};
