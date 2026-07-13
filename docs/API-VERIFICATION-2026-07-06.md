# BE API 명세 검증 보고서

- **검증일**: 2026-07-06
- **대상 서버**: `https://api.semojum.app` (운영)
- **방법**: 명세 문서의 전 엔드포인트를 curl로 직접 호출 (정상 + 에러 케이스 20여 건)
- **결론 요약**: 인증·Job·마이페이지·요소 편집 API는 대체로 명세와 일치. 단 **명세와 다른 지점 5곳** 발견 — 그중 2곳(drafts 이중 인코딩, 점역자주 래퍼)은 FE에 방어 로직을 반영했고, 나머지는 BE 수정이 필요.

---

## 1. 명세대로 동작 확인된 항목

### 인증 (Auth)

| # | 케이스 | 기대 | 실제 | 판정 |
| --- | --- | --- | --- | --- |
| 1 | `GET /api/auth/email/check` (가입 전) | `available: true` | `available: true` | ✅ |
| 2 | 〃 (가입 후 동일 이메일) | `available: false` (200) | `available: false` (200) | ✅ |
| 3 | 〃 email 파라미터 누락 | COMMON4000 / 400 | COMMON4000 / 400 | ✅ |
| 4 | `POST /api/auth/signup` | `{ email, name }` | 일치 | ✅ |
| 5 | 〃 중복 이메일 재가입 | AUTH4002 / 409 | AUTH4002 / 409 | ✅ |
| 6 | `POST /api/auth/login` | accessToken + refreshToken | 일치 | ✅ |
| 7 | 〃 틀린 비밀번호 | AUTH4001 / 401 | AUTH4001 / 401 | ✅ |
| 8 | `POST /api/auth/refresh` | 새 accessToken | 일치 | ✅ |
| 9 | `POST /api/auth/logout` | 성공 | 성공 (200) | ✅ |
| 10 | 로그아웃 후 refresh 재시도 | 거부 | AUTH4003 / 401 | ✅ |
| 11 | 인증 없이 보호 API 호출 | COMMON4001 / 401 | COMMON4001 / 401 | ✅ |

### Job / SSE

| # | 케이스 | 기대 | 실제 | 판정 |
| --- | --- | --- | --- | --- |
| 12 | `POST /api/jobs` mode a/b/c (PDF·TXT) | jobId + PENDING | 3개 모드 모두 성공 | ✅ |
| 13 | 〃 잘못된 모드 (`mode=x`) | JOB4003 / 400 | JOB4003 / 400 | ✅ |
| 14 | 〃 mode a에 TXT 업로드 | JOB4002 / 400 | JOB4002 / 400 (메시지가 명세보다 상세) | ✅ |
| 15 | `GET /api/jobs/{id}/status` | 페이지별 상태 | 명세 구조 일치 | ✅ |
| 16 | `GET /api/jobs/{id}/events` (SSE) | page_done → job_done | 정상 수신. **완료된 작업에 늦게 접속해도 이벤트 리플레이됨** | ✅ |
| 17 | queue_position 이벤트 | 대기 시 주기 전송 | 대기열 없이 즉시 처리되어 **미관측** (검증 불가) | ➖ |

### 마이페이지 / 요소 편집

| # | 케이스 | 기대 | 실제 | 판정 |
| --- | --- | --- | --- | --- |
| 18 | `GET /api/users/jobs` | 목록 (내림차순) | 명세 구조 일치, thumbnailUrl 포함 | ✅ |
| 19 | `GET /api/users/jobs/{id}/pages/1` (mode b) | `original.lines` 배열 | 원문 줄 배열 정상 | ✅ |
| 20 | 〃 (mode a) | `original.url` PDF | GCS URL 접근 200 / `application/pdf` | ✅ |
| 21 | `PATCH .../elements/{elementId}` | contents 교체 | 반영 확인, **재조회 시 영속 확인** | ✅ |
| 22 | 〃 elementType 소문자 `braille` | (명세: TEXT/BRAILLE) | **대소문자 무관 허용** | ✅ |
| 23 | 〃 잘못된 elementType (`IMAGE`) | JOB4005 / 400 | JOB4005 / 400 | ✅ |
| 24 | 〃 존재하지 않는 요소 | JOB4004 / 404 | JOB4004 / 404 | ✅ |

### rule_trail (점자규정)

mode c 작업에서 실데이터 수신 확인 — **명세의 전체 필드가 그대로 내려옴**:

```json
{
  "rule_id": "KBR-6.13.51",
  "source": "한국 점자 규정",
  "priority": "primary",
  "section": "제6장 · 제13절 문장 부호 · 제51항",
  "title": "문장 부호",
  "excerpt": "쌍점의 앞은 붙여 쓰고 뒤는 한 칸 띄어 쓴다.",
  "line_no": 2, "col_start": 7, "col_end": 9,
  "tag": "symbol"
}
```

→ QA의 "점자규정 표시 구현 X"는 **데이터는 정상이고 FE UI만 없던 것**. 블록별 규정 패널 UI를 구현해 해결함 (`BlockItem.tsx`).

---

## 2. 명세와 다른 항목 (BE 전달 필요)

### 2-1. 🔴 `drafts`가 JSON 문자열로 이중 인코딩됨

시각 요소(차트 이미지 PDF, mode c)에서 `drafts`가 명세의 객체 배열이 아니라 **배열을 직렬화한 문자열**로 옴:

```json
"drafts": "[{\"text\": \"<!점역자주>그래프: ...<!/점역자주>\", \"label\": \"수학적 서술\", \"contents\": [...]}]"
```

- SSE와 저장된 페이지 조회(`GET /api/users/jobs/.../pages/1`) **양쪽 모두** 동일.
- 기존 FE는 배열이 아닌 값을 버렸으므로 **초안 피커가 아예 안 뜨던 것이 QA "복수 초안 안 보임"의 직접 원인**.
- **FE 조치 완료**: 문자열이면 `JSON.parse`로 복원하는 방어 로직 추가 (`mapPageResult.ts`). 현재 서버 그대로도 초안 표시됨.
- **BE 요청**: 명세대로 객체 배열로 직렬화 수정 권장.

### 2-2. 🔴 초안이 1개만 생성되고 `draft.text` == `tn_text` (동일 내용)

- 명세: "격자형 / 행↔열 전치 / 위치 중심 / 요약" 등 복수 초안 제공.
- 실제: 초안 1개(`label: "수학적 서술"`)만 오고, 그 `text`가 요소의 `tn_text`와 완전 동일.
- QA 지적("tnText, contents 각각 하나의 결과만 보임. 내용이 동일함")과 정확히 일치 — **AI/BE 쪽 수정 필요. FE에서는 해결 불가.**

### 2-3. 🔴 mode b의 `text_list`가 빈 배열

- 명세: mode b 결과에 원문 요소 목록(`text_list`)이 포함되어 `braille_text_list`와 id로 매핑됨.
- 실제: SSE·저장본 모두 `"text_list": []` → 블록별 원문 매핑 불가.
- FE 영향: 라이브 변환은 업로드 파일 원문으로 표시하므로 치명적이지 않고, 마이페이지 복원은 기존 `original.lines` 폴백으로 동작함. **블록 단위 원문 대조 기능을 위해 BE 수정 필요.**

### 2-4. 🔴 페이지 전체가 요소 1개로 뭉쳐서 옴 (전 모드 공통)

- 5문장짜리 TXT(mode b) → `braille_text_list` 1개.
- 텍스트 PDF(mode a/c) → `bounding_box_list` 1개 + 요소 1개 (페이지 전면 bbox).
- **QA "모드 B 페이지 청크 — 블록 단위 편집 불가"의 원인이 BE임을 확정.** 문단/요소 단위 분할을 BE에 요청해야 함.

### 2-5. 🟡 기타 사소한 불일치

| 항목 | 명세 | 실제 | FE 영향 |
| --- | --- | --- | --- |
| 존재하지 않는 job 조회 | JOB4001 / 404 | COMMON4003 / 403 | 에러 메시지만 다름 — 무해 |
| `tn_text` 내용 | 순수 한글 설명 | `<!점역자주>...<!/점역자주>` 래퍼 포함 | **FE에서 래퍼 제거 처리 완료** |
| `heading_level`, `flags`, `caption_ref` 등 | `0` / `[]` / `""` | `null` | FE 방어 처리됨 |
| mode a `contents` 줄 | 줄 목록 | 한 문자열 안에 `\n`·트레일링 공백 포함 | 렌더에는 무해 |
| `ocr_confidence_avg` | 0~1 | 항상 `0.0` | 명세에 이미 경고된 사항 |
| 로그아웃 응답 | `result: null` | `result` 필드 자체 없음 | 무해 |

---

## 3. 검증에 따른 FE 코드 반영 (2026-07-06)

| 파일 | 내용 |
| --- | --- |
| `src/utils/mapPageResult.ts` | 문자열 drafts JSON 파싱 복원(`parseDrafts`), `<!점역자주>` 래퍼 제거(`stripTnWrapper`) |
| `src/types/apiTypes.ts` | `drafts?: Draft[] \| string \| null`, `tn_text?: string \| null` 등 실응답 타입 반영 |
| `src/utils/__tests__/mapPageResult.test.ts` | 실서버 응답 형태 회귀 테스트 2건 추가 |
| `src/api/JobService.ts` | **요소 편집 `PATCH .../elements/{elementId}` 연동** (`patchElement`) — 이로써 명세 12개 엔드포인트 전부 FE 연동 완료 |
| `src/App.tsx`, `src/component/features/conversion/BlockItem.tsx` | 블록 포커스 이탈/초안 선택 시 자동 저장, 변경 없으면 스킵, 실패 시 "저장 실패 — 다시 시도" 표시. 결과 분리 창(팝업) 편집도 메인 창이 대신 저장 |

검증 상태: `tsc --noEmit` 통과, vitest **122/122 통과**, `bun run build` 성공.

---

## 4. FE 한계 — 명세에 대응 API가 없어 서버 저장이 불가한 기능

에디터는 아래 조작을 지원하지만, 명세에 대응 엔드포인트가 없어 **로컬 상태에만 반영되고 서버에는 저장되지 않는다.** 앱을 재시작하거나 마이페이지에서 다시 불러오면 사라진다.

| 에디터 기능 | 필요한 API (제안) | 현재 상태 |
| --- | --- | --- |
| 블록 새로 추가 (`+` 버튼) | `POST .../pages/{pageNo}/elements` (요소 생성) | ❌ 로컬 전용 |
| 블록 삭제 | `DELETE .../elements/{elementId}` | ❌ 로컬 전용 |
| 블록 순서 변경 (드래그) | 요소 `order` 수정 지원 (PATCH body 확장 등) | ❌ 로컬 전용 |
| 블록 내용 수정 / 초안 선택 | `PATCH .../elements/{elementId}` | ✅ 연동 완료 (2026-07-06) |

이 외 참고:

- PATCH는 `contents`만 교체 가능 — 초안 선택 시 명세의 `selected_idx`를 서버에 기록할 방법이 없다. FE는 선택된 초안의 `contents`를 PATCH하는 방식으로 대신한다.
- Job 삭제·계정 탈퇴 API도 없다 (아래 비고의 테스트 데이터 정리 불가 사유와 동일).

---

---

## 5. 비고

- 검증용 계정: `claude.qa.1783335501@test.com` (pw: `password123`) — 테스트 Job 4건 생성됨.
  삭제 API가 명세에 없어 서버에 남아 있음. (Job 삭제/계정 탈퇴 API 추가 검토 요청)
- SSE의 페이지 순서 비보장(명세 경고)은 1페이지 문서로만 테스트해 미검증.
- 소셜 로그인(카카오/구글)은 브라우저 상호작용이 필요해 이번 자동 검증에서 제외.
