#!/usr/bin/env bash
# 서버 요청서 PDF 만들기 — index.html → ../서버_요청사항.pdf
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
chrome="${CHROME:-/Applications/Google Chrome.app/Contents/MacOS/Google Chrome}"
out="$here/../서버_요청사항.pdf"
"$chrome" --headless --disable-gpu --no-pdf-header-footer \
  --print-to-pdf="$out" "file://$here/index.html" >/dev/null 2>&1
echo "만들었습니다: $out ($(pdfinfo "$out" | awk '/^Pages:/{print $2}')쪽)"
