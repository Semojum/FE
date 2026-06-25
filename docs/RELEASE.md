# 데스크톱 앱 빌드 & 배포 가이드

BrailleMate 데스크톱 앱(Tauri 2)을 CI로 빌드하고 정식 배포하는 절차입니다.

## 빌드 대상

`.github/workflows/build.yml`이 아래 3개 플랫폼을 빌드합니다.

| 플랫폼 | 타깃 | 산출물 |
|--------|------|--------|
| macOS (Apple Silicon + Intel) | `universal-apple-darwin` | `.dmg`, `.app.tar.gz`(업데이터) |
| Windows x64 | `x86_64-pc-windows-msvc` | `.msi`, `.exe`(NSIS), `*.zip`(업데이터) |
| Linux x64 | `x86_64-unknown-linux-gnu` | `.deb`, `.AppImage`, `.rpm` |

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
- **테스트 빌드**: GitHub Actions → "Build Desktop App" → Run workflow(`workflow_dispatch`) → 각 OS 산출물이 artifact로 업로드됩니다.

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

### 2. macOS 코드 서명 + 공증 (스캐폴딩 — 현재 미설정)

기본 상태에서는 **미서명 빌드**가 생성됩니다(Gatekeeper 경고 발생, 내부 테스트용). 정식 서명/공증을 켜려면 **두 가지**가 필요합니다.

1. `build.yml`의 두 빌드 스텝에서 `APPLE_*` env **6줄의 주석을 해제**합니다.
2. 아래 Secrets를 등록합니다.

> ⚠️ 인증서가 없는 상태에서 env 주석만 풀면, 빈 값이 들어가 tauri가 빈 인증서를 import 하려다 codesign 단계에서 **빌드가 실패**합니다. 반드시 Secrets와 함께 활성화하세요.

전제: **Apple Developer Program**($99/년) 가입 + **Developer ID Application** 인증서 발급.

| Secret | 설명 |
|--------|------|
| `APPLE_CERTIFICATE` | Developer ID 인증서(.p12)를 base64로 인코딩한 문자열 |
| `APPLE_CERTIFICATE_PASSWORD` | .p12 비밀번호 |
| `APPLE_SIGNING_IDENTITY` | 예: `Developer ID Application: Your Name (TEAMID)` |
| `APPLE_ID` | 공증용 Apple ID 이메일 |
| `APPLE_PASSWORD` | Apple ID의 **앱 암호**(app-specific password) |
| `APPLE_TEAM_ID` | Apple Developer 팀 ID |

`.p12` → base64 (macOS):
```bash
base64 -i certificate.p12 -o certificate-base64.txt
```

### 3. Windows 코드 서명 (스캐폴딩 — 현재 미설정)

현재 워크플로는 Windows를 **미서명**으로 빌드합니다(SmartScreen 경고 발생). 정식 서명하려면 OV/EV 코드사이닝 인증서가 필요하며, 다음 중 하나를 적용하세요.

- **Azure Trusted Signing**(권장, EV 수준): `tauri.conf.json`의 `bundle > windows`에 `signCommand` 구성 후 Azure 자격증명을 Secrets로 주입
- **인증서 지문 방식**: 러너에 인증서를 가져온 뒤 `bundle > windows > certificateThumbprint`, `timestampUrl` 설정

자세한 구성은 Tauri 문서의 Windows code signing 가이드를 참고하세요.

---

## 코드 서명이 없을 때

서명/공증을 설정하지 않아도 빌드 자체는 성공하며 설치 파일이 생성됩니다. 단:
- **macOS**: "확인되지 않은 개발자" 경고 → 사용자가 우클릭 > 열기로 우회해야 함
- **Windows**: SmartScreen "Windows의 PC 보호" 경고 → "추가 정보 > 실행"으로 우회해야 함

정식 외부 배포에는 위 1·2·3을 모두 설정하는 것을 권장합니다. (업데이터 서명 1번은 자동 업데이트를 쓰는 한 필수입니다.)

---

## 로컬 의존성 동기화 (최초 1회)

자동 업데이트용 패키지가 `package.json`에 추가되었으므로, 락파일/`node_modules` 동기화가 필요합니다.

```bash
bun install
```

> CI는 `bun install --frozen-lockfile`을 사용하므로, `bun.lock`이 갱신되어 커밋되어 있어야 빌드가 통과합니다.
