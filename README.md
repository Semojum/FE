# 세모점 (BrailleMate) — Front-end

점역 담당자용 **Windows 데스크톱 앱**. 원문(PDF·TXT·HWP)을 올리면 AI가 텍스트·점자로
변환하고, 담당자가 블록 단위로 교정해 `.brf` / `.txt`로 내보낸다.

## 배포 타깃

**Windows 데스크톱 앱 전용이다.** 웹으로 서비스하지 않는다.

- 릴리스는 GitHub Actions(`.github/workflows/build.yml`)가 `windows-latest`에서 빌드해
  NSIS·MSI 인스톨러와 자동 업데이트용 `latest.json`을 발행한다.
- macOS·Linux 번들은 만들지 않는다. 다른 OS에서 개발(`bun run tauri:dev`)하는 것은 자유지만,
  배포 산출물은 Windows만 낸다.
- `bun run dev`(브라우저)와 `bun run preview`는 **UI 확인용 개발 도구**다. 자동 업데이트,
  결과 창 분리(네이티브 창), 종료 시 저장, CORS 우회 fetch처럼 Tauri 런타임이 필요한
  기능은 브라우저에서 동작하지 않으므로 실제 확인은 `tauri:dev`로 한다.

## 실행

```bash
bun install
bun run tauri:dev     # 데스크톱 앱으로 실행 (권장)
bun run dev           # 렌더러만 브라우저로 (UI 확인용)

bun run test          # 단위 테스트
bunx tsc --noEmit     # 타입 검사
bun run tauri:build   # 로컬 번들 빌드
```

## 문서

- 구현 계획·마일스톤: [`docs/V3-PLAN.md`](docs/V3-PLAN.md)
- 릴리스 절차: [`docs/RELEASE.md`](docs/RELEASE.md)
- API 검증 기록: `docs/API-VERIFICATION-*.md`

기획(기능정의서)·API 명세는 Notion, 디자인은 Figma에서 관리한다.
백엔드는 `https://api.semojum.app`, 공통 응답은 `{isSuccess, code, message, result}`.
