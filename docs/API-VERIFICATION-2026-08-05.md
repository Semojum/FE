# API 검증 — 2026-08-05 (V3)

운영 서버 `https://api.semojum.app`에 V3 계정(`org0102`)으로 로그인해 FE가 호출하는
엔드포인트를 실제로 두드려 본 기록. 검증에 쓴 폴더·작업은 모두 완전 삭제해 계정을
원래(비어 있는) 상태로 되돌렸다.

> ⚠️ 검증 도중(17:0x경) BE가 재배포되어 목록 응답 형태가 바뀌었다. 아래 "형태 변경" 항목 참고.

## 요약

| 구분 | 결과 |
|---|---|
| 정상 동작 | 로그인 · 폴더 CRUD · 즐겨찾기 · 이름변경 · 벌크 이동/삭제 · 휴지통(목록·복원·완전삭제) · 검색/필터/정렬 · Job 생성(insertPageNumber 포함) · 상태 조회 · 페이지 결과 조회 |
| **미배포** | `PUT .../pages/{no}/elements` (405) · `PATCH .../draft` (404) · `POST .../download` (404) · `POST .../send-to-braille` (404) · `GET /api/app/version` (401/404) |
| FE 수정 | 3건 (아래) |

## FE에서 고친 것

### 1. 목록 응답 형태가 명세와 달랐다 → 양쪽 모두 수용

검증 시작 시점의 운영 서버는 `files`를 **평평한 배열**로, `nextCursor`/`hasMore`를
형제 필드로 내려줬다. 명세는 `files: { items, nextCursor, hasMore }`다.

```jsonc
// 실측 (오전)                          // 명세 = 재배포 후 (오후)
{ "folders": [], "files": [],          { "folders": [],
  "nextCursor": null, "hasMore": false }  "files": { "items": [], "nextCursor": null, "hasMore": false } }
```

FE가 명세 형태만 읽고 있어 목록이 **항상 비어 보이는** 상태였다. `normalizeContents`
(`src/api/FolderService.ts`)로 두 형태를 모두 흡수하도록 고쳤다. 재배포로 명세 형태가
된 지금도, 다시 뒤집혀도 동작한다.

### 2. 헤더에 계정 대신 UUID가 보였다

accessToken payload는 `{ sub, iat, exp }`뿐이고 **`sub`이 loginId가 아니라 사용자 UUID**다.

```json
{"sub": "cc6c7a9d-c40e-484a-b48e-fcc527b92fbd", "iat": 1785916416, "exp": 1785920016}
```

`GET /me`도 없으므로, 표시용 loginId는 로그인 시 입력한 값을 세션 동안 들고 있도록 바꿨다
(`UseAuth`). 토큰을 재발급해도 유지된다.

### 3. 앱 시작하자마자 "세션이 만료되었습니다"가 떠 로그인 자체가 막혔다

`GET /api/app/version`이 미배포라 **401**을 준다 → `apiClient`가 401을 보고 토큰 재발급을
시도 → 리프레시 토큰이 없으니 `clearSession('expired')` → 로그인 화면 위에 만료 안내
모달이 떠서 **로그인 버튼을 가렸다**. 로그인 전에 앱이 완전히 잠기는 상태였다.

두 군데를 고쳤다.
- `apiClient`: **토큰을 붙이지 않은 요청의 401은 재발급을 시도하지 않는다**. 재발급해도
  달라질 게 없고, 인증 불필요 엔드포인트의 401이 세션 상태를 오염시키면 안 된다.
- `UseAuth.refreshSession`: 애초에 로그인한 적이 없으면(토큰도 리프레시 토큰도 없음)
  "세션 종료" 사유를 붙이지 않는다.

## 엔드포인트별 상세

| 엔드포인트 | 결과 |
|---|---|
| `POST /api/auth/login` | ✅ `{accessToken, refreshToken}`. 오답 시 401 AUTH4001 |
| `GET /api/folders/contents` | ✅ (형태 이슈는 위 1번) |
| `GET /api/folders/{id}/contents` | ✅ |
| `GET /api/folders/tree` | ✅ |
| `POST /api/folders` | ✅ 중복 이름 → 409 FOLDER4002 |
| `DELETE /api/folders/{id}` | ✅ |
| `PATCH /api/jobs/{id}` (이름변경) | ✅ |
| `PATCH /api/jobs/{id}/favorite` | ✅ |
| `POST /api/jobs/move` | ✅ |
| `POST /api/jobs/trash` | ✅ |
| `GET /api/trash` · `POST /api/trash/{id}/restore` · `DELETE /api/trash/{id}` | ✅ 복원 시 `restoredTo`에 원래 폴더 반환 |
| `GET /api/users/jobs` (검색·필터·정렬) | ✅ 검색어는 폴더명·파일명 양쪽에 걸린다. status/mode 필터 시 folders는 빈 배열 |
| `GET /api/users/jobs/active` | ✅ (빈 배열) |
| `POST /api/jobs` | ✅ `insertPageNumber` 기록·반환됨. 잘못된 확장자 → 400 JOB4002 |
| `GET /api/jobs/{id}/status` | ✅ |
| `GET /api/users/jobs/{id}/pages/{no}` | ✅ `insertPageNumber` 내려옴. 모드 b는 `braille_text_list` + `original.lines` |
| `PUT /api/jobs/{id}/pages/{no}/elements` | ❌ **405 COMMON4005** — 미배포 |
| `PATCH .../elements/{id}/draft` | ❌ **404** — 미배포 |
| `POST /api/jobs/{id}/download` | ❌ **404** — 미배포 |
| `POST /api/jobs/{id}/send-to-braille` | ❌ **404** — 미배포 |
| `GET /api/app/version` | ❌ **401/404** — 미배포. 배포 시 PERMIT_URLS 등록 필요(명세상 Auth: None) |
| (참고) V2 `PATCH .../elements/{id}` | 아직 살아 있음 — 200 |

## 실앱 확인 (브라우저 + vite proxy)

로그인 실패 문구 → 로그인 → 헤더 계정 표시 → 마이페이지 빈 상태 → 새 폴더 생성 후
목록 반영까지 확인. 재배포 전/후 응답 형태 양쪽에서 동일하게 통과했다.

## 남은 사항

- **편집 저장이 현재 동작하지 않는다.** `PUT .../elements`가 미배포라 Ctrl+S·페이지 이동
  저장이 전부 실패한다(편집 내용은 유실되지 않고 dirty로 남으며 토스트로 알린다).
  V2 요소 API가 아직 살아 있으므로, BE 배포가 늦어지면 임시 폴백을 넣는 선택지가 있다.
- 다운로드·점역으로 보내기·강제 업데이트도 BE 배포 전까지 실패 안내만 뜬다.
