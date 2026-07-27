# BE API 명세 재검증 보고서 (2차)

- **검증일**: 2026-07-27
- **대상 서버**: `https://api.semojum.app` (운영)
- **명세 출처**: Notion “API” DB — **엔드포인트 16건** (2026-07-06 검증 시점 12건 → 4건 추가)
- **방법**: 새로 추가된 엔드포인트를 curl로 직접 호출(정상 + 에러 케이스), 이전 보고서의 미해결 항목 재확인
- **결론**: 2026-07-06 보고서 §4의 **“대응 API가 없어 서버 저장 불가”는 해소**됐다. 블록 추가/삭제/순서변경 3개 API가 신설돼 실서버에서 명세대로 동작하고, FE 연동을 마쳤다. 이전 지적 중 `drafts` 이중 인코딩도 BE에서 수정됐다. **남은 BE 이슈는 3건**(초안 1개만 생성, mode b `text_list` 빈 배열, 페이지 단일 요소)이며 여기에 **신규 이슈 1건(전 신규 Job이 BLOCKED)** 이 추가됐다.

---

## 1. 신규 엔드포인트 3건 — 명세대로 동작 확인

### 1-1. 블록 추가 `POST /api/jobs/{jobId}/pages/{pageNo}/elements`

| # | 케이스 | 기대 | 실제 | 판정 |
| --- | --- | --- | --- | --- |
| 1 | `afterElementId` = 기존 요소 | 그 요소 뒤에 삽입, `result.id` 발급 | 일치 (UUID 발급) | ✅ |
| 2 | `afterElementId: null` | 페이지 맨 앞에 삽입 | 맨 앞 삽입 확인 | ✅ |
| 3 | `contents: [""]` (빈 블록) | — | 200 정상 생성 | ✅ |
| 4 | 삽입 후 `order` | 서버가 1..N 재번호 | 재조회 시 1,2,3 재번호 확인 | ✅ |
| 5 | mode a에 `elementType: TEXT` | text_list에 추가 | 정상 | ✅ |

> FE는 `+` 버튼을 누른 시점에 빈 블록(`contents: [""]`)을 생성하고, 서버가 발급한 `result.id`로
> 로컬 임시 ID를 교체한다. 이 교체가 있어야 이후 수정/삭제/순서변경이 같은 요소에 걸린다.

### 1-2. 블록 삭제 `DELETE .../elements/{elementId}?elementType=`

| # | 케이스 | 기대 | 실제 | 판정 |
| --- | --- | --- | --- | --- |
| 6 | 정상 삭제 | 200, soft-delete | 200, 재조회 시 목록에서 제외 | ✅ |
| 7 | 삭제 후 남은 블록 순서 | 1..N 재번호 | 재번호 확인 | ✅ |
| 8 | 이미 삭제된 요소 재삭제 | JOB4004 / 404 | JOB4004 / 404 | ✅ |
| 9 | `elementType` 쿼리 누락 | COMMON4000 / 400 (추정) | **COMMON5000 / 500** | ⚠️ |

### 1-3. 블록 순서변경 `PATCH .../elements/order`

| # | 케이스 | 기대 | 실제 | 판정 |
| --- | --- | --- | --- | --- |
| 10 | 전체 순열 전송 | 배열 순서대로 reading_order 1..N | 재조회 시 요청 순서대로 반영 | ✅ |
| 11 | 일부 ID 누락 | JOB4006 / 400 | JOB4006 / 400 | ✅ |
| 12 | 신규 블록 포함 순열 | 정상 | 추가→수정→순서변경→삭제 연쇄 정상 | ✅ |

### 1-4. 명세에 있으나 이번에도 검증하지 못한 것

- `POST /api/auth/kakao`, `POST /api/auth/google` — 브라우저 상호작용 필요(자동 검증 제외). FE는 loopback OAuth로 연동돼 있다.

---

## 2. 이전 보고서 지적사항 재확인

| 항목 | 2026-07-06 | 2026-07-27 | 상태 |
| --- | --- | --- | --- |
| 2-1 `drafts`가 JSON 문자열로 이중 인코딩 | 🔴 문자열 | **객체 배열로 정상 수신** | ✅ BE 수정 완료 (FE 방어 로직은 하위호환용으로 유지) |
| 2-2 초안 1개 + `draft.text` == `tn_text` | 🔴 | 동일 (초안 1개, `label: "수학적 서술"`) | 🔴 미해결 — AI/BE |
| 2-3 mode b `text_list`가 빈 배열 | 🔴 | 동일 (`"text_list": []`) | 🔴 미해결 — BE |
| 2-4 페이지 전체가 요소 1개 | 🔴 | 기존 Job 기준 동일 (신규 Job은 BLOCKED로 재현 불가) | 🔴 미해결 — BE |
| 2-5 `tn_text`의 `<!점역자주>` 래퍼 | 🟡 | 래퍼 그대로 유지 | 🟡 FE에서 계속 제거 처리 |
| §4 블록 추가/삭제/순서변경 API 부재 | 🔴 | **API 신설 + FE 연동 완료** | ✅ 해소 |
| queue_position 이벤트 (7/6에는 미관측) | ➖ | **관측됨** (`position:1, estimated_wait_sec:30` 주기 전송) | ✅ 명세대로 |

### 🔴 신규 이슈 — 신규 Job이 전부 `BLOCKED`로 종료됨

검증 중 새로 만든 mode b Job 2건이 모두 아래처럼 끝났다 (단문 1줄 TXT / 4문단 TXT 동일).

```
event:page_done
data:{"type":"page_done","job_id":"...","page_no":1,"status":"BLOCKED"}

event:job_done
data:{"type":"job_done","job_id":"...","total_pages":1,"failed_pages":[1]}
```

- `page_done`에 `result`가 아예 없고, `GET /api/users/jobs/{id}/pages/1`은 **JOB4001 / 404**를 반환한다.
- `GET /api/jobs/{id}/status`는 `overallStatus: COMPLETED`인데 `pages: {"page:1": "BLOCKED"}` — 전체는 성공, 페이지는 실패로 보인다.
- **BE 확인 요청**: AI 처리 파이프라인이 차단 상태인지, 쿼터/키 문제인지. 이 상태에서는 어떤 파일을 올려도 결과가 나오지 않는다.
- **FE 조치**: 결과 패널이 빈 화면(“결과가 없습니다.”)만 보여 원인을 알 수 없던 문제를 고쳐, BLOCKED 페이지에 실패 안내를 표시하도록 했다.

---

## 3. FE 코드 반영 (2026-07-27)

| 파일 | 내용 |
| --- | --- |
| `src/api/JobService.ts` | `createElement`(POST) / `deleteElement`(DELETE) / `reorderElements`(PATCH order) 추가 — **명세 16개 엔드포인트 중 소셜 로그인 2건 제외 전부 FE 연동 완료** |
| `src/hooks/UseTranslationBlocks.ts` | `addBlock`이 새 블록 ID를 반환하도록 변경, 서버 발급 ID 교체용 `replaceBlockId`, 삭제 롤백용 `insertBlockAt` 추가 |
| `src/App.tsx` | 블록 추가 시 POST → 서버 ID로 교체, 삭제 시 낙관적 제거 후 DELETE(실패하면 원위치 복원), 드래그 순서변경은 600ms 디바운스 후 PATCH order. 생성 응답 도착 전에 삭제된 블록은 서버에서도 정리(고아 요소 방지) |
| `src/App.tsx` | 저장(persist)이 “서버에 있으면 PATCH / 없으면 POST”로 동작 — 추가가 실패한 블록도 내용을 쓰고 포커스를 빼면 재시도된다 |
| `src/App.tsx`, `src/hooks/UsePopupSync.ts` | `pageStatuses` 추가 — BLOCKED 페이지에 “이 페이지는 변환하지 못했습니다” 안내 표시. 마이페이지 복원 시 `failedPages`에도 동일 적용, 결과 분리 창(팝업)에도 동기화 |
| `src/component/features/conversion/BlockItem.tsx` | 삭제 실패 시 “삭제 실패 — 다시 시도” 버튼 표시 |
| `src/api/__tests__/JobService.test.ts`, `src/hooks/__tests__/UseTranslationBlocks.test.ts` | 신규 API 6건 + 블록 상태 조작 4건 회귀 테스트 추가 |

### 순서변경(order) 연동 시 주의점

명세상 `orderedElementIds`는 **그 페이지의 살아있는 요소 전체의 순열**이어야 하고, 하나라도 빠지면 JOB4006이다.
그래서 FE는 아직 서버에 생성되지 않은 블록(추가 POST 실패 등)이 페이지에 하나라도 있으면 **순서 저장을 보류**하고,
그 블록이 생성된 직후 최종 순서를 다시 한 번 동기화한다.

검증 상태: `tsc --noEmit` 통과, vitest **132/132 통과**, `bun run build` 성공.

---

## 4. BE에 요청할 남은 항목

1. **신규 Job이 전부 BLOCKED** — 최우선. 현재 서비스 전체가 사실상 변환 불가 상태.
2. 시각 요소 **복수 초안** 생성 (현재 1개, 내용도 `tn_text`와 동일) — 명세의 “격자형 / 행↔열 전치 / 위치 중심 / 요약”.
3. mode b **`text_list` 채우기** — 블록 단위 원문 대조에 필요.
4. **문단/요소 단위 분할** — 페이지 전체가 요소 1개로 뭉쳐 나오면 블록 편집의 의미가 없다.
5. `DELETE .../elements/{id}`에서 **`elementType` 누락 시 500 → 400(COMMON4000)** 으로 정정.
6. 초안 선택 시 `selected_idx`를 서버에 기록할 방법이 여전히 없다 (FE는 선택 초안의 `contents`를 PATCH해 대체).
7. Job 삭제 / 계정 탈퇴 API 부재 — 검증용 테스트 데이터가 서버에 계속 쌓인다.

---

## 5. 비고

- 검증용 계정: `claude.qa.1783335501@test.com` (pw: `password123`) — 이번 검증으로 테스트 Job 2건이 추가돼 총 6건. 삭제 API가 없어 서버에 남아 있다.
- 이번 검증에서 생성한 테스트 블록은 모두 DELETE로 정리했다. 다만 mode b Job(`job_260706110100_9df83c378b`)의 원래 요소 내용은 이전 검증 때 `⠟`로 덮어써진 상태 그대로다.
- SSE 페이지 순서 비보장(명세 경고)은 이번에도 1페이지 문서로만 테스트해 미검증.
