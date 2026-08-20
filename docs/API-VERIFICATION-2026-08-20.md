# API 검증 — 2026-08-20 (중복 로그인 감지 · 기관 관리 흰 화면)

QA에서 두 가지가 올라왔다 — ① 다른 위치에서 로그인해도 기존 위치가 로그아웃되지 않는다
② 기관 관리 화면이 0.5초쯤 보이다가 화면 전체가 하얘진다. 운영 서버(`https://api.semojum.app`,
계정 `org0102`·`org0105`)와 Notion [V3] API 명세서로 원인을 확인한 기록.

## 요약

| 항목 | 확인 결과 |
|---|---|
| 밀려난 세션의 `accessToken` | **만료(1시간) 전까지 그대로 200** — 401이 나지 않는다 |
| 밀려난 세션의 `refreshToken` | 401 `AUTH4003` (즉시 revoke) |
| `GET /api/org/accounts` 응답 | 명세 2026-08-20 정정 — `month`·`monthCredits`·`self` → `usageSince`·`usedCredits`·`isSelf` |
| `GET /api/public/notices` | ✅ **열렸다** (08-19에는 404) — 로그인 화면 공지 패널이 그대로 뜬다 |

## 1. 중복 로그인 — 밀려난 쪽은 아무 요청도 실패하지 않는다

같은 계정으로 두 번 로그인한 뒤 첫 번째 세션의 토큰을 각각 두드렸다.

```
login#1 → accessToken A1 / refreshToken R1
GET /api/users/usage  (A1)      → 200
login#2 → accessToken A2 / refreshToken R2
GET /api/users/usage  (A1)      → 200   ← 밀려난 세션인데도 그대로 유효
POST /api/auth/refresh (R1)     → 401 AUTH4003
POST /api/auth/refresh (R2)     → 200
```

서버가 revoke하는 것은 **refreshToken뿐**이다. accessToken은 무상태 JWT라 만료 전까지 살아 있다.

그래서 기존 FE 설계("요청이 401을 받으면 리프레시하고, 그게 AUTH4003이면 밀려난 것")로는
밀려난 세션이 **최대 한 시간** 그대로 돌아가고, 사용자가 화면만 띄워 두고 아무 요청도 하지
않으면 영영 로그아웃되지 않는다. V3-PLAN Q2("밀려난 세션의 FE 감지 시점")의 실제 답이다.

**대응 (`UseAuth`).** 세션 생사를 가리는 수단이 리프레시뿐이므로 주기적으로 두드린다.

- 60초마다 + 창 포커스가 돌아올 때(최소 간격 10초) `POST /api/auth/refresh`
- `AUTH4003` → `clearSession('evicted')` → 로그인 화면의 "다른 기기에서 로그인" 안내
- 성공하면 새 accessToken을 그대로 물려 세션 유지도 겸한다
- **네트워크 오류·5xx로는 세션을 끊지 않는다** — 잠깐 끊긴 것을 세션 종료로 오인하면
  작업 중인 화면이 날아간다. 서버가 거절한 경우(401·`AUTH4003`·`COMMON4001`)만 끊는다.
  (같은 이유로 401 경로의 `refreshSession`도 네트워크 오류에서는 로그아웃하지 않게 바꿨다.)

## 2. 기관 관리 흰 화면 — `/api/org/accounts` 응답 필드가 바뀌었다

명세가 오늘(2026-08-20 04:24Z) 고쳐졌다. "사용"이 **월 단위 → 계약 시작일 이후 누적**으로
바뀌면서 필드 이름이 셋 바뀌었다.

| 구 명세 | 신 명세 |
|---|---|
| `month: "2026-08"` | `usageSince: "2026-02-24"` |
| `monthCredits` | `usedCredits` |
| `self` | `isSelf` |

FE는 계정 표에서 `formatNumber(a.monthCredits)`를 부르고 있었다 →
`undefined.toLocaleString()`이 던진다 → **렌더 중 예외 → 리액트가 트리를 통째로 떼어 냄 →
흰 화면.** 대시보드(필수 호출)가 먼저 그려지고 계정 목록이 조금 뒤에 도착하므로,
"0.5초 보이다가 하얘진다"는 증상과 정확히 맞는다.

**대응**

1. 타입·서비스를 새 계약으로 맞추고, 옛 이름으로 주는 배포본도 흡수한다
   (`normalizeOrgAccounts` — `usedCredits ?? monthCredits ?? 0`, `isSelf ?? self ?? false`).
2. 화면의 나머지 위험한 곳도 같이 막았다 — `contractExpiresAt`이 null이면 `daysUntil`이
   `split`에서 던지고, `monthlyUsage`·`orders.items`가 없으면 `.length`에서 던진다.
   `formatNumber`도 값이 숫자가 아니면 `—`로 떨어뜨린다.
3. **ErrorBoundary를 새로 뒀다** (`component/shared/ErrorBoundary.tsx`). 앱 루트와
   마이페이지 하위 화면(기관 관리·사용량)을 감싼다. 필드 하나 때문에 앱 전체가 하얘지는
   대신 무엇이 잘못됐는지와 돌아갈 길("다시 시도" / "앱 새로 시작")을 보여 준다.

### 실서버 응답 (계정 `org0105` · ROLE_ORG_ADMIN, 2026-08-20)

기관 담당자 계정을 받아 `/api/org/*` 5종을 직접 확인했다. 배포본은 **신·구 이름을 섞어 준다.**

```jsonc
// GET /api/org/accounts
{ "usageSince": "2026-08-01",            // ← 신 이름
  "items": [ { "loginId": "org0105", "alias": null, "status": "ACTIVE",
               "role": "ROLE_ORG_ADMIN", "lastLoginAt": "2026-08-20T06:43:40Z",
               "usedCredits": 0,          // ← 신 이름 (monthCredits 없음 = 흰 화면의 원인)
               "self": true } ] }         // ← 구 이름 그대로
```

`monthCredits`가 실제로 없다 — 흰 화면의 원인이 이것으로 확정됐다. `self`는 아직 구 이름이라
`normalizeOrgAccounts`의 `isSelf ?? self` 폴백이 지금 당장 필요하다(없으면 "본인" 표시가
사라지고 자기 계정에 잠금 버튼이 뜬다).

`dashboard`·`orders`·`notices`·`requests`·`accounts/{loginId}/jobs`·`users/usage`는 타입과
일치했다. 다만 **`contractType`이 `BASIC`**으로 온다 — 명세 예시(`PAID`)에도, FE 유니온에도
없던 값이라 화면에 코드가 그대로 노출됐다. `BASIC: '기본'`을 넣고 유니온을 열어 두었다
(모르는 값은 코드를 그대로 보여 준다).

이 응답들을 그대로 넣은 렌더 테스트를 `OrgAdminView.test.tsx`에 넣었다.

## 3. 덤으로 — 로그인 화면 공지가 살아났다

`GET /api/public/notices`가 열렸다(08-19 실측 404 → 오늘 200). 인증 없이 200이며 응답도
`NoticeService`가 기대하던 형태 그대로라, **코드 수정 없이** 로그인 화면 공지 패널이 뜬다.
`VITE_API_BASE_URL= bun run dev`로 띄운 로그인 화면에서 "8/20 새벽 서버 점검 안내"가
보이는 것을 확인했다.

```
GET /api/public/notices → 200
{"result":[{"id":"26003e01-…","title":"8/20 새벽 서버 점검 안내",
            "body":"02:00~03:00 점검으로 …","startsOn":"2026-08-18","endsOn":"2026-08-21", …}]}
```

`types/org.ts`의 `PublicNotice` 주석("아직 서버에 없는 엔드포인트")은 이제 옛말이다.

## 4. 기관 관리는 단독 화면으로 (요청 반영)

기관 관리는 마이페이지 하위 패널로 열려서 위에 마이페이지 헤더(돌아가기·사용량·기관 관리·
계정 ID)가 그대로 남아 있었다. 담당자 업무(계약·계정·주문)가 내 파일 목록 위에 얹힌 것처럼
보이므로, `subView === 'org'`일 때는 마이페이지 껍데기를 그리지 않고 **화면 전체를 기관 관리로만**
채운다. 돌아갈 길은 화면 자체의 "← 마이페이지" 버튼이다. 사용량(T3)은 종전대로 마이페이지
안에 남는다.

## 5. 앱내 문의 (FAB) — 접수 경로와 권한

문의 접수는 `POST /api/org/requests`(T2) 하나를 그대로 쓴다. 화면은 기관 관리에서 떼어
내 **모든 계정에 보이는 FAB**으로 뒀다(오른쪽 아래, 마이페이지·기관 관리 위에도 뜬다).
유형은 서버가 받는 두 가지(`CREDIT_ADD`·`ACCOUNT_ISSUE`)만 노출하고, 본문은 1000자까지다.
창을 열면 `GET /api/org/requests`로 지난 문의와 처리 상태를 함께 보여 주고, `OPEN`인 건은
그 자리에서 취소(hard delete)할 수 있다.

**아직 서버는 이 엔드포인트를 `ROLE_ORG_ADMIN`으로 막고 있다.** 권한을 풀어 달라고 요청해
둔 상태라(사용자 확인 2026-08-20), FE는 모든 계정에 열어 두고 403(`COMMON4003`)이 오면
"아직 기관 담당자 계정만 문의를 보낼 수 있습니다"로 안내한다. 조회가 막힌 계정에서는 지난
문의 목록을 통째로 감춘다(빈 상자를 두지 않는다). 서버가 열리는 순간 코드 수정 없이 동작한다.

일반 계정으로 실제 접수를 눌러 확인하려 했으나 `org0102`/`0102`가 오늘 오후부터
`AUTH4001`이라(비밀번호가 바뀐 것으로 보인다) 403 여부는 실서버로 재확인하지 못했다.

## 6. 기관 담당자의 착지 화면

`ROLE_ORG_ADMIN`으로 로그인하면 변환 작업 화면이 아니라 **기관 관리부터** 연다
(`App`이 로그인 직후 마이페이지를 `initialSubView='org'`로 마운트한다. 세션마다 한 번).
담당자는 점역 작업자가 아니라 관리자이므로 착지점이 다르다. 작업 화면이 필요하면
기관 관리 → "← 마이페이지" → "돌아가기"로 갈 수 있다.
