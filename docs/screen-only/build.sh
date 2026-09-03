#!/usr/bin/env bash
# 화면·파일 차이 정리 PDF 만들기 — index.html → ../화면과_파일의_차이.pdf
#
# Windows(Git Bash)에서는 CHROME을 넘긴다:
#   CHROME="/c/Program Files/Google/Chrome/Application/chrome.exe" bash docs/screen-only/build.sh
# Chrome은 MSYS 경로(/c/…)를 못 읽으므로 file:// URL은 cygpath로 만든다.
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
chrome="${CHROME:-/Applications/Google Chrome.app/Contents/MacOS/Google Chrome}"
out="$here/../화면과_파일의_차이.pdf"

if command -v cygpath >/dev/null 2>&1; then
  src="file:///$(cygpath -m "$here/index.html")"
  dst="$(cygpath -w "$out")"
else
  src="file://$here/index.html"
  dst="$out"
fi

"$chrome" --headless --disable-gpu --no-pdf-header-footer \
  --print-to-pdf="$dst" "$src" >/dev/null 2>&1
echo "만들었습니다: $out"
