# 세모점 FE — V3 구현 계획

기준 문서
- 기능정의서 (Notion DB `3a743813bc2e808d94dac79ad4de267d`)
- [V3] API 명세서 (Notion `3b143813bc2e80069813f883e4a8b7f5`, child DB `3b243813-bc2e-8072-96aa-c4c1054c47c3`)
- 디자인 (Figma `cIypVucW8KsCC8Lap9Qrcb`, page `0:1 UI` — `V3/*` 컴포넌트 + `V3-01`~`V3-06` 프레임)

작성일 2026-08-05.

---

## 1. 목표

V2(현행 코드)를 **V3.0 (1차 PoC)** 범위로 끌어올린다. 세 가지 축:

1. **인증 모델 교체** — 회원가입·소셜 로그인 제거, 운영자 발급 `loginId`/PW 단일 로그인, 자동 로그인 없음, 중복 로그인 금지.
2. **마이페이지 = 파일 탐색기** — 폴더·이동·이름변경·휴지통·검색·즐겨찾기·필터/정렬. V3 신규 화면 S1~S9 전체.
3. **편집·저장 모델 교체** — 요소 단위 4종 API → **페이지 단위 일괄 저장(PUT)** 1종. Ctrl+Z/Ctrl+S, 재시작 복구.

성공 기준: 기능정의서의 V3.0 항목이 전부 `완료`가 되고, 각 화면이 Figma `V3-*` 프레임과 일치하며, 호출하는 모든 엔드포인트가 V3 API 명세와 계약상 일치한다.

---

## 2. 현행(V2) ↔ V3 격차

| 영역 | 현행 코드 | V3 요구 | 조치 |
|---|---|---|---|
| 로그인 | `email`+PW, 회원가입, 이메일 중복확인, 카카오/구글 loopback OAuth, refreshToken 자동 로그인 | `loginId`+PW 단일, 가입·소셜 전부 삭제, **자동 로그인 없음**, 중복 로그인 시 기존 세션 revoke | 교체 |
| 토큰 | localStorage 영속 | 메모리 보관(재실행 시 재로그인), access 1h / refresh 12h | 교체 |
| 마이페이지 | `MyPageModal` + 평면 카드 목록 (`GET /api/users/jobs` 배열) | S1~S9 (폴더/휴지통/검색/이동/즐겨찾기/필터/커서 페이지네이션/주소·뒤로가기) | 신규 |
| 목록 응답 | `result`가 배열 | `result = { folders, files:{items,nextCursor,hasMore} }` | 교체 |
| 블록 편집 | `PATCH element` · `POST element` · `DELETE element` · `PATCH order` 4종 | `PUT /api/jobs/{jobId}/pages/{pageNo}/elements` 1종 (배열 = 페이지 최종 상태) | 교체 |
| 되돌리기 | 없음 | Ctrl+Z / Ctrl+Shift+Z (FE, 페이지 단위, 세션 종료 시 폐기) | 신규 |
| 저장 시점 | 조작 즉시 | 페이지 이동 / 앱 종료 / Ctrl+S | 교체 |
| 업로드 | file+mode | `insertPageNumber` 추가, 95MB 사전 검증, 413 비-JSON 방어, HWPX 안내 | 보강 |
| 진행 표시 | 페이지별 | + 전체 진행률 프로그레스바 | 보강 |
| 재시작 복구 | 없음 | `GET /api/users/jobs/active` → 최신 작업의 `lastEditedPage`로 바로 복구 | 신규 |
| 다운로드 | 클라이언트 Blob | `POST /api/jobs/{jobId}/download` (파일명 지정 모달, 수정 시 서버 재조판) | 교체 |
| 점역으로 보내기 | FE 병합 후 재업로드 | `POST /api/jobs/{jobId}/send-to-braille` (+ JOB4011 덮어쓰기 확인) | 교체 |
| 대체 초안 | 로컬 스와프 | `PATCH .../elements/{elementId}/draft` (`selectedIdx`, -1=원본 복귀) | 교체 |
| 자동 업데이트 | tauri-plugin-updater | + `GET /api/app/version` 강제 업데이트 잠금, 좌하단 토스트, 릴리스 노트 새 창 | 보강 |
| 에러 코드 | V2 코드 집합 | V3 신규 15종(COMMON4004/4005, AUTH4004, ORG*, JOB4007~4011, FOLDER4001~4004) | 보강 |

---

## 3. BE 구현 상태 (착수 순서를 여기서 결정)

| 상태 | 엔드포인트 |
|---|---|
| ✅ 구현 완료 | auth login/refresh/logout · jobs 생성·상태·페이지결과 · **folders 전체** · **trash 전체** · jobs move/trash/rename/favorite · users/jobs · users/jobs/active |
| 🟡 진행 중 | `GET /api/jobs/{jobId}/events` (SSE) |
| ⬜ 시작 전 | `PUT .../pages/{pageNo}/elements` · `PATCH .../draft` · `POST .../download` · `POST .../send-to-braille` · `GET /api/app/version` |

→ **지금 끝까지 만들 수 있는 것: 인증(M1) + 마이페이지 디렉토리(M3).**
→ 편집 모델(M2)·다운로드/연계(M5)·버전 체크(M6)는 **서비스 계층과 UI까지 만들되, BE 미배포 구간은 기존 V2 경로를 폴백으로 유지**하고 플래그로 전환한다.

---

## 4. 마일스톤

### M0 — 계약 기반 정비 ✅
- `apiClient`: 상태코드 우선 분기(413/502/504 등 비-JSON 응답), V3 에러코드 → 사용자 문구 매핑 테이블.
- `types/apiTypes.ts`·`types/auth.ts`를 V3 응답 형태로 재정의 (`FolderNode`, `FileCard`, `TrashItem`, `ActiveJob` 등).

### M1 — 인증 V3 전환 ✅
- `AuthService`: `login(loginId, password)`. `signup`/`checkEmail`/`exchangeOAuthCode` 삭제.
- `UseAuth`: 마운트 자동 로그인 부트스트랩 제거, 토큰 메모리 보관, 세션 중 401 → refresh 1회 유지.
- 로그인 화면 재작성 (Figma `V3-01` 3종: 기본 / AUTH4001 인라인 오류 / 중복 로그인 안내 모달 → 로그인 화면 복귀).
- AUTH4004(비활성 계정) 안내. 소셜 로그인 코드(`UseOAuth`/`oauthConfig`/`pkce`) 제거.

### M3 — 마이페이지 디렉토리 ✅
- 화면: S1 메인 · S2 폴더 내부 · S3 새 폴더 · S4 폴더로 이동 · S5 이름 변경 · S6 삭제 확인 · S7 검색 결과 · S8 휴지통 · S9 최근 작업 전체.
- 조회 3경로 통일: `GET /api/folders/contents`(S1) · `GET /api/folders/{id}/contents`(S2) · `GET /api/users/jobs`(S9·검색).
- 조작: 폴더 CRUD, `POST /api/jobs/move`, `POST /api/jobs/trash`, `PATCH /api/jobs/{id}`, 즐겨찾기 토글 2종, 휴지통 복원/완전삭제.
- 상호작용: 클릭=선택 / 더블클릭=열기, Ctrl·Shift·Ctrl+A 다중 선택(파일만), ⋯·우클릭 메뉴, 브레드크럼, 커서 무한 스크롤(30개), 생성 중 카드 있을 때 10초 폴링, 폴더 id 기반 주소·뒤로가기.
- 제한: 폴더 이름 50자 · 깊이 5 · 계정당 200개 · 파일 1,000개 상한 경고.

### M2 — 편집·저장 모델 V3 ✅
- `PUT .../elements` 서비스 + 페이지 로컬 편집 버퍼.
- Ctrl+Z / Ctrl+Shift+Z (블록 내 편집·추가·삭제), Ctrl+S, 페이지 이동·앱 종료 시 flush.
- 대체 초안 `PATCH .../draft`.

### M7 — 결과 패널 격자 에디터 ✅ (2026-08-05 추가)

결과 패널은 블록 카드 리스트가 아니라 **점자 판면 격자**다 (Figma V3-03).

| 항목 | 규칙 |
|---|---|
| 판면 | 26줄 × 32칸. 쪽번호를 넣으면 본문 25줄 + 마지막 줄 쪽번호 |
| 출력 쪽 | 페이지네이션으로 끊지 않는다. 모든 줄을 이어 붙여 판면 규격으로 자르고 **세로로 계속 스크롤**한다. 우상단에 `n / N쪽` 표시 |
| 하단 페이지네이션 | **원본 파일 페이지**만 옮긴다. 넘기면 결과 격자는 그 페이지의 첫 줄로 스크롤해 대조를 유지한다 |
| 선택 | 칸을 클릭하면 그 줄이 통째로 선택되고 커서는 클릭한 칸에 놓인다 |
| 편집 | 커서 칸에 **밀어쓰기**(끼워 넣으면 뒤쪽 글자가 오른쪽으로 밀린다). Backspace/Delete는 글자를 지우고 뒤쪽을 왼쪽으로 당긴다. Enter=다음 줄, Tab=다음 칸. 점자 모드는 SDF/JKL 6점 동시 입력, 한글은 IME 조합 후 반영. 한 줄이 32칸을 넘으면 `+n` 표시로 알린다(줄바꿈은 조판이 담당) |
| 우클릭 | 블록 추가 / 대체 초안 / 블록 삭제 |
| 원본 대조 | 원본 블록을 고르면 그 블록의 줄 묶음이 주황 테두리로 한 덩어리로 강조된다 |

저장 단위는 그대로 **원본 페이지**다 — 격자 줄마다 `pageNo`·`blockId`·`lineIndex`를
들고 있어 `PUT .../pages/{pageNo}/elements`로 되돌린다.

> 기능정의서 "원본 파일 미리보기"의 *"페이지를 이동하면 원본과 결과 패널이 항상 같은
> 페이지를 유지한다"*는 이 구조와 어긋난다. Figma와 팀 결정(2026-08-05)이 기준이며
> 문서 쪽이 갱신 대상이다.

### M4 — 업로드·진행·복구 ✅
- 업로드 시 `insertPageNumber` 선택(Figma `V3-02`), 95MB 사전 검증, HWPX 안내 문구.
- 전체 진행률 프로그레스바, 네트워크 단절 문구.
- 재시작 복구: `GET /api/users/jobs/active` → 최신 `lastEditedPage`(null이면 1p).

### M5 — 산출물·연계 ✅
- 다운로드 모달(파일명 지정) → `POST .../download`.
- 점역으로 보내기 → `POST .../send-to-braille`, JOB4011 시 덮어쓰기 확인 모달.

### M6 — 버전·업데이트 ✅
- `GET /api/app/version` → `forceUpdate` 시 화면 잠금, 좌하단 설치 토스트, 업데이트 노트 새 창.

---

## 5. 진행 상태 (2026-08-05)

M0~M6 전부 구현 완료. **BE가 명세대로 전부 구현되었다는 전제**로 작성했으므로,
아직 "시작 전"으로 표시된 5개 엔드포인트는 실제 배포 후 검증이 필요하다.

| 엔드포인트 | FE 호출 위치 | 배포 전 동작 |
|---|---|---|
| `PUT .../pages/{no}/elements` | `UsePageEditor.savePage` | 저장 실패 토스트 + dirty 유지(편집 내용은 안 잃음) |
| `PATCH .../elements/{id}/draft` | `App.handleSelectDraft` | 콘솔 경고만, 화면 반영은 로컬로 유지 |
| `POST .../download` | `DownloadModal` · 마이페이지 카드 메뉴 | 모달에 에러 문구 |
| `POST .../send-to-braille` | 결과 패널 "점역으로 보내기" | 토스트로 실패 안내 |
| `GET /api/app/version` | `UseAppVersion` | 조용히 무시(강제 업데이트 미적용) |

### 배포 타깃

**Windows 데스크톱 앱 전용**이다(2026-08-05 확정). 웹 배포는 하지 않으며, 관련 설정
(gh-pages·firebase·vercel)은 전부 제거했다. CI 릴리스 빌드도 `windows-latest` 하나다.
`bun run dev`/`preview`는 UI 확인용 개발 도구로만 남긴다.

### 검증 현황
- 타입 검사 · 단위 테스트(157건) · 프로덕션 빌드 통과.
- 목 API를 붙여 실제 앱을 구동해 로그인 → 마이페이지(S1) → 폴더 내부(S2) → 우클릭 메뉴 →
  휴지통(S8) 흐름을 확인했다(콘솔 에러 없음).
- **실서버 검증 완료** (2026-08-05, 계정 `org0102`) — 결과는
  [`docs/API-VERIFICATION-2026-08-05.md`](API-VERIFICATION-2026-08-05.md).
  계약 불일치 3건을 찾아 고쳤고(목록 응답 형태·loginId 표시·로그인 전 세션 오염),
  미배포 5개 엔드포인트를 확인했다.

## 6. 남은 확인 항목

| # | 내용 | 근거 |
|---|---|---|
| Q1 | 미배포 5개 엔드포인트의 BE 배포 일정 — 특히 `PUT .../elements`가 없어 **편집 저장이 동작하지 않는다**. 지연되면 V2 요소 API로 임시 폴백을 넣을지 결정 필요 | 실측 405/404 |
| Q2 | 중복 로그인으로 밀려난 세션의 FE 감지 시점 — 현재는 refresh 시 AUTH4003으로만 감지(별도 푸시 없음) | 로그인 D-6 미결 |
| Q3 | 파일 1,000개 상한 경고 UI의 트리거 — 목록 응답에 잔여 수 필드가 없어 미구현 | 마이페이지 D-2 |
| Q4 | V3.1 관리자 페이지(계정 발급·사용량·운영)는 이번 범위 밖 | 기능정의서 개발단계 V3.1 |
