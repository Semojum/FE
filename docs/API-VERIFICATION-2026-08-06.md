# API 검증 — 2026-08-06 (미배포 5종 재확인)

[2026-08-05 검증](API-VERIFICATION-2026-08-05.md)에서 미배포로 확인된 5개 엔드포인트를
운영 서버 `https://api.semojum.app`에 계정 `org0102`로 다시 두드린 기록. 검증용으로 만든
작업은 휴지통 → `DELETE /api/trash/{id}`로 완전 삭제해 계정을 원래(비어 있는) 상태로 되돌렸다.

## 요약

| 엔드포인트 | 08-05 | 08-06 | 명세 `구현 상태` |
|---|---|---|---|
| `PUT /api/jobs/{id}/pages/{no}/elements` | 405 | ✅ **배포됨** | 구현 완료 (PR #84·#85·#86) |
| `PATCH .../elements/{id}/draft` | 404 | ❌ 404 | 진행 중 |
| `POST /api/jobs/{id}/download` | 404 | ❌ 404 | 시작 전 |
| `POST /api/jobs/{id}/send-to-braille` | 404 | ❌ 404 | **명세 DB에 항목 없음** |
| `GET /api/app/version` | 401/404 | ❌ 401(무인증)/404(인증) | 시작 전 |

미배포 4종은 경로·메서드 변형(`/downloads`, `/api/users/jobs/...` 접두, `GET`/`POST` 교차 등)을
모두 시도해도 전부 `COMMON4004`(경로 없음)다. 다른 이름으로 배포된 게 아니라 실제로 없다.
`send-to-braille`은 명세 DB 33건 전수를 훑어도 항목 자체가 없다 — 명세부터 필요하다.

## `PUT .../elements` — 배포됐지만 계약이 바뀌었다

명세 페이지에 `구현·배포·실서버 검증 완료 (2026-08-06, PR #84·#85·#86)`이 붙으면서
요청/응답 형태가 우리가 08-05에 구현한 것과 달라졌다. FE 3곳을 고쳤다.

### 1. 요청 키가 `elementId` → `id`

가장 조용하고 위험한 차이다. 서버는 `id`를 읽고, **`id`가 없는 항목은 신규 블록으로 보고
새 id를 발급**한다. FE가 `elementId`로 보내고 있었으므로 저장할 때마다 페이지의 모든 요소가
새 id로 갈아치워졌다.

```
# elementId로 저장 (기존 FE) — 매번 id가 바뀐다
PUT … {"elements":[{"elementId":"4cdef856-…","contents":["수정"]}]}
  → result: [{"id":"6ec2f224-…"}]      # 새 id
  → 한 번 더 → [{"id":"81baee98-…"}]   # 또 새 id

# id로 저장 (명세대로) — id가 유지된다
PUT … {"elements":[{"id":"81baee98-…","contents":["수정"]}]}
  → result: [{"id":"81baee98-…"}]      # 그대로, 반복해도 동일
```

파급: `bounding_box_list`는 원래 id를 유지하므로, id가 갈리는 순간
`mapPageResult`의 `bboxes.find(b => b.id === item.id)`가 전부 빗나가
**첫 저장 직후부터 OCR·통합 모드의 bbox 하이라이트가 사라진다.**

### 2. 응답이 객체가 아니라 배열

```jsonc
// FE가 기대하던 것                     // 실제 (= 명세)
{ "savedCount": 2,                      [ { "id": "…", "contents": ["…"] },
  "elementIds": ["…"],                    { "id": "…", "contents": ["…"] } ]
  "editLogged": {…} }
```

`UsePageEditor.savePage`가 `res.elementIds.forEach(...)`를 호출하고 있었다.
`elementIds`가 `undefined`라 TypeError가 나고, 그게 저장 실패 catch로 떨어져
**서버에는 정상 저장됐는데 화면에는 "수정 내용을 저장하지 못했습니다"가 뜨고 dirty가 유지되는**
상태였다. 응답 배열의 위치로 신규 블록 id를 매핑하도록 고쳤다.

### 3. body에서 `elementType` 제거

편집 대상(`text_list` / `braille_text_list`)은 서버가 job의 mode로 판정한다.
BE는 남아 있어도 무시하지만(bogus 값도 통과) 명세에 맞춰 뺐다.
`savePageElements`와 `usePageEditor`에서 `elementType` 인자를 없앴다
(`selectDraft`는 여전히 쓰므로 `ElementType` 타입 자체는 유지).

### 명세대로 확인된 동작

| 항목 | 결과 |
|---|---|
| 배열 = 페이지 최종 상태, 순서 = reading_order | ✅ 저장 후 `order` 1..N 재번호 |
| `id: null` → 신규 발급 | ✅ |
| 배열에서 빠진 요소 soft-delete | ✅ 재조회 시 사라짐 |
| 모르는 id | ✅ 404 `JOB4004` "존재하지 않는 요소입니다" |
| `elements` 누락 | 400 `COMMON4000` (`elementType`만 있으면 400) |
| 없는 jobId | 404 `JOB4001` |

## 그 밖에 확인된 것

- `POST /api/jobs` (PDF, mode a) → `jobId`는 UUID가 아니라 `job_260806211316_b6c5864ade`
  형태의 접두사 문자열이다. 1쪽 PDF 변환은 2초대에 `overallStatus: COMPLETED`.
- `GET /api/jobs/{id}/status` 응답의 상태 필드 이름은 `overallStatus`(+ `pages: {"page:1": …}`)다.
- 폴더·휴지통·목록 계열은 08-05와 동일하게 정상.

## 남은 사항

- **편집 저장은 이제 동작한다** (위 3건 수정 후). 다운로드·초안 선택·강제 업데이트는
  여전히 BE 미배포라 실패 안내만 뜬다.
- **`send-to-braille`은 BE에서 만들지 않기로 확정** — FE가 교정된 전체 페이지를 합쳐
  모드 b Job으로 재업로드하는 방식(V2와 동일)으로 교체했다. 실서버로 확인:
  텍스트 파일을 `POST /api/jobs` (mode `b`)로 올리면 점역 결과가 정상으로 내려온다
  (`braille_text_list` + `original.lines` 보존).
- `GET /api/app/version`은 배포 시 `PERMIT_URLS` 등록이 필요하다(명세상 Auth: None인데
  현재는 무인증 호출에 401을 준다).
