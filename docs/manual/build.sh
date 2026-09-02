#!/usr/bin/env bash
# 사용 설명서 PDF 만들기 — index.html → docs/세모점_사용설명서.pdf
#
# 헤드리스 크롬의 print-to-pdf로 뽑는다. 목차 쪽 번호는 한 번 뽑아 본 뒤
# 각 장이 실제로 앉은 쪽을 읽어 채워 넣고 다시 뽑는다(2패스).
set -euo pipefail

here="$(cd "$(dirname "$0")" && pwd)"
out="$here/../세모점_사용설명서.pdf"
chrome="${CHROME:-/Applications/Google Chrome.app/Contents/MacOS/Google Chrome}"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

render() {
  "$chrome" --headless --disable-gpu --no-pdf-header-footer \
    --print-to-pdf="$2" "file://$1" >/dev/null 2>&1
}

# 1패스 — 쪽 번호를 알아내려고 뽑는다.
render "$here/index.html" "$tmp/pass1.pdf"

# 각 장이 몇 쪽에 앉았는지 — 장 머리에 심어 둔 보이지 않는 표식을 쪽마다 찾는다.
total="$(pdfinfo "$tmp/pass1.pdf" | awk '/^Pages:/{print $2}')"
cp "$here/index.html" "$tmp/out.html"
for n in $(seq 1 15); do
  found=""
  for p in $(seq 1 "$total"); do
    if pdftotext -f "$p" -l "$p" "$tmp/pass1.pdf" - 2>/dev/null | tr -d "[:space:]" | grep -q "CHAPMARK${n}END"; then
      found="$p"; break
    fi
  done
  [ -n "$found" ] || continue
  perl -0pi -e "s/(data-pg=\"ch$n\">)(<)/\${1}$found\$2/" "$tmp/out.html"
done

# 2패스 — 목차가 채워진 최종본.
cp "$here/manual.css" "$tmp/manual.css"
ln -s "$here/figures" "$tmp/figures"
render "$tmp/out.html" "$out"
echo "만들었습니다: $out ($(pdfinfo "$out" | awk '/^Pages:/{print $2}')쪽)"
