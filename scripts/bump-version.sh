#!/usr/bin/env bash
# 릴리즈 버전 올리기 — 버전이 네 곳(package.json · tauri.conf.json · Cargo.toml ·
# Cargo.lock)에 있어 손으로 맞추다 보면 하나가 빠진다. 여기서 한 번에 바꾼다.
#
#   scripts/bump-version.sh 3.1.1          # 버전만 바꾼다 (커밋은 직접)
#   scripts/bump-version.sh 3.1.1 --tag    # + 커밋과 v3.1.1 태그까지 만든다 (푸시는 직접)
#
# 푸시(git push origin main --tags)까지는 하지 않는다 — 릴리즈 노트를 커밋 본문에
# 담는 관례라, 커밋 메시지를 다듬은 뒤 직접 미는 흐름을 남겨 둔다.
set -euo pipefail
cd "$(dirname "$0")/.."

VERSION="${1:?사용법: scripts/bump-version.sh <버전> [--tag]}"
if ! [[ "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo "버전은 x.y.z 형식이어야 합니다: $VERSION" >&2
  exit 1
fi

python3 - "$VERSION" <<'PY'
import json, re, sys
v = sys.argv[1]

def edit_json(path):
    s = open(path, encoding='utf-8').read()
    d = json.loads(s)
    old = d['version']
    # 포맷을 흐트러뜨리지 않게 해당 줄만 바꾼다.
    s2 = s.replace(f'"version": "{old}"', f'"version": "{v}"', 1)
    assert s2 != s or old == v, path
    open(path, 'w', encoding='utf-8').write(s2)
    print(f'{path}: {old} → {v}')

edit_json('package.json')
edit_json('src-tauri/tauri.conf.json')

path = 'src-tauri/Cargo.toml'
s = open(path, encoding='utf-8').read()
s2, n = re.subn(r'^version = "[^"]+"', f'version = "{v}"', s, count=1, flags=re.M)
assert n == 1, path
open(path, 'w', encoding='utf-8').write(s2)
print(f'{path}: → {v}')
PY

# Cargo.lock의 semojum 항목을 맞춘다 (-w: 워크스페이스 크레이트만, 의존성은 안 건드림)
(cd src-tauri && cargo update -w --quiet)
echo "src-tauri/Cargo.lock: 갱신"

if [[ "${2:-}" == "--tag" ]]; then
  git add package.json src-tauri/tauri.conf.json src-tauri/Cargo.toml src-tauri/Cargo.lock
  git commit -m "chore: release v$VERSION"
  git tag "v$VERSION"
  echo
  echo "커밋과 태그 v$VERSION 생성 완료. 확인 후:"
  echo "  git push origin main --tags"
fi
