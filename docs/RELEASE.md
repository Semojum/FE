# 데스크톱 앱 빌드 & 배포 가이드

BrailleMate 데스크톱 앱(Tauri 2)을 CI로 빌드하고 정식 배포하는 절차입니다.

## 빌드 대상

**배포 타깃은 Windows 데스크톱 앱 하나입니다.** `.github/workflows/build.yml`이
`windows-latest`에서만 빌드하며, macOS·Linux 번들은 발행하지 않습니다.

| 플랫폼 | 타깃 | 산출물 |
|--------|------|--------|
| Windows x64 | `x86_64-pc-windows-msvc` | `.exe`(NSIS), `.msi`, `*.nsis.zip`(업데이터) |

> 다른 OS에서 개발하는 것은 자유지만(`bun run tauri:dev`), 릴리스 산출물은 Windows만 냅니다.
> `tauri.conf.json`의 `bundle.targets`도 `["nsis", "msi"]`로 고정되어 있어, 다른 OS에서
> `tauri build`를 돌리면 번들 단계에서 만들 것이 없다고 나옵니다(개발용 실행은 정상).

## 트리거 방법

> 릴리스는 리모트 `origin`(`github.com/Semojum/FE`)에 발행됩니다. 자동 업데이트 엔드포인트(`tauri.conf.json`의 `plugins.updater.endpoints`)도 이 리포를 가리킵니다. 릴리스 발행 리포가 바뀌면 두 곳을 함께 수정하세요.

- **정식 릴리스**: 버전 범프 → `v*` 태그 푸시 → 빌드 후 GitHub Release(초안) 생성 + 자동 업데이트용 `latest.json` 발행

  1. **버전 올리기** (자동 업데이트는 버전 비교로 동작하므로 매 릴리스마다 필수). 아래 세 파일의 `version`을 새 버전으로 맞춥니다.
     - `src-tauri/tauri.conf.json` → `version` (← 실제 앱/번들 버전, 업데이터 비교 기준)
     - `package.json` → `version`
     - `src-tauri/Cargo.toml` → `version`
  2. 커밋 후 **태그를 동일 버전으로** 푸시합니다.
     ```bash
     git commit -am "chore: release v0.1.0"
     git tag v0.1.0
     git push origin main --tags
     ```
  완료되면 GitHub의 Releases에 **초안(draft)** 릴리스가 생깁니다. 내용 확인 후 **Publish** 하면 사용자에게 노출되고, 기존 사용자 앱이 다음 실행 시 새 버전을 감지합니다.

  > 태그(`v0.1.0`)와 `tauri.conf.json`의 `version`(`0.1.0`)을 반드시 일치시키세요. 불일치 시 릴리스는 만들어져도 자동 업데이트 버전 비교가 어긋납니다.
- **테스트 빌드**: GitHub Actions → "Build Desktop App" → Run workflow(`workflow_dispatch`) → Windows 산출물이 artifact로 업로드됩니다.

---

## ⚠️ 빌드 전 반드시 필요한 GitHub Secrets

### 1. 자동 업데이트 서명 키 (필수 — 없으면 빌드 실패)

자동 업데이트 아티팩트(`createUpdaterArtifacts: true`)는 서명이 필수입니다. 키페어는 이미 생성되어 있고, **공개키는 `src-tauri/tauri.conf.json`에 커밋**되어 있습니다. 개인키는 로컬에만 있습니다(리포에 커밋 금지).

- 개인키 파일 위치(생성 시): `~/.tauri/braillemate-updater.key`
- 아래 두 Secret을 등록하세요.

| Secret | 값 |
|--------|-----|
| `TAURI_SIGNING_PRIVATE_KEY` | `~/.tauri/braillemate-updater.key` 파일의 **전체 내용** |
| `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | 키 생성 시 지정한 비밀번호 (없이 생성했다면 빈 값) |

개인키 내용 확인(Windows PowerShell):
```powershell
Get-Content $HOME\.tauri\braillemate-updater.key -Raw
```

> 🔐 개인키와 비밀번호를 분실하면 더 이상 업데이트를 서명할 수 없어 기존 사용자에게 자동 업데이트를 내보낼 수 없습니다. 안전하게 백업하세요. 새 키로 교체하면 `tauri.conf.json`의 `plugins.updater.pubkey`도 함께 갱신해야 합니다.

### 2. Windows 코드 서명 (스캐폴딩 — 현재 미설정)

현재 워크플로는 Windows를 **미서명**으로 빌드합니다(SmartScreen 경고 발생). 정식 서명하려면 OV/EV 코드사이닝 인증서가 필요하며, 다음 중 하나를 적용하세요.

- **Azure Trusted Signing**(권장, EV 수준): `tauri.conf.json`의 `bundle > windows`에 `signCommand` 구성 후 Azure 자격증명을 Secrets로 주입
- **인증서 지문 방식**: 러너에 인증서를 가져온 뒤 `bundle > windows > certificateThumbprint`, `timestampUrl` 설정

자세한 구성은 Tauri 문서의 Windows code signing 가이드를 참고하세요.

---

## 코드 서명이 없을 때

서명을 설정하지 않아도 빌드 자체는 성공하며 설치 파일이 생성됩니다. 단, 설치할 때
SmartScreen "Windows의 PC 보호" 경고가 떠서 사용자가 "추가 정보 > 실행"으로 우회해야 합니다.
IT 지원 인력이 없는 기관에 배포하는 제품이므로, 정식 배포 전에는 코드 서명을 붙이는 것을
권장합니다. (업데이터 서명 1번은 자동 업데이트를 쓰는 한 필수입니다.)

---

## 로컬 의존성 동기화 (최초 1회)

자동 업데이트용 패키지가 `package.json`에 추가되었으므로, 락파일/`node_modules` 동기화가 필요합니다.

```bash
bun install
```

> CI는 `bun install --frozen-lockfile`을 사용하므로, `bun.lock`이 갱신되어 커밋되어 있어야 빌드가 통과합니다.
