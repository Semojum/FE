# API 검증 — 2026-08-07 (꼬리말 · 결과 다운로드)

BE에서 두 가지를 알려 왔다 — ① Job 생성이 꼬리말(`footerText`)을 request로 받는다
② `POST /api/jobs/{jobId}/download`가 구현 완료. 명세([V3] API 명세서)를 다시 읽고
운영 서버 `https://api.semojum.app`에 계정 `org0102`로 확인한 기록.
검증용 작업은 휴지통 → `DELETE /api/trash/{id}`로 완전 삭제해 계정을 원래 상태로 되돌렸다.

## 요약

| 항목 | 08-06 | 08-07 |
|---|---|---|
| `POST /api/jobs` 의 `footerText` (multipart) | 명세에 없음 | ✅ 동작 |
| `POST /api/jobs/{id}/download` | ❌ 404 | ✅ **배포됨** (200 + 파일 스트림) |
| `footerText` 200자 초과 | — | ✅ 400 `COMMON4000` |

## 1. 꼬리말 — `footerText` (2026-08-07 명세 추가)

Job 생성 multipart의 선택 항목. 묵자로 넣고 200자 이하. `jobs.footer_text`에 저장되고
생성 응답에 그대로 되돌아온다.

```
POST /api/jobs  (mode=b, insertPageNumber=true, footerText=수학 익힘책 1)
→ {"result":{"jobId":"job_260807210236_...","mode":"b","totalPages":1,
             "status":"PENDING","insertPageNumber":true,"footerText":"수학 익힘책 1"}}
```

201자를 보내면 `400 COMMON4000 "잘못된 요청입니다."`. 이 문구만으로는 꼬리말이 원인인지
알 수 없어서 FE에서 먼저 거른다 (`footerTextMessage`, 입력창 `maxLength`도 200).

**주의 — 복원 경로에는 값이 없다.** `GET /api/users/jobs/{jobId}/pages/{pageNo}` 응답에는
`insertPageNumber`만 있고 `footerText`는 없다. 마이페이지에서 불러온 작업의 꼬리말은
FE가 알 수 없다(다운로드 시점에 서버가 저장값을 쓰므로 결과물에는 정상 반영된다).
그래서 작업을 복원할 때 FE 상태의 꼬리말은 비운다 — 이전 업로드 값이 다음 업로드로
새는 것을 막는다.

## 2. 결과 다운로드 — 배포 확인

```
POST /api/jobs/{jobId}/download   body {"fileName":"꼬리말 확인"}
→ 200
   content-type: text/plain;charset=UTF-8
   content-disposition: attachment; filename="download.brf";
                        filename*=UTF-8''%EA%BC%AC%EB%A6%AC%EB%A7%90%20%ED%99%95%EC%9D%B8.brf
```

- 응답이 JSON이 아니므로 `apiRequestBinary`의 분기(`!res.ok || content-type: json`)를 그대로 통과한다.
- 파일명은 `filename*`(RFC 5987)에서 읽는다 — `filename=`은 항상 `download.brf` 고정이라
  이걸 쓰면 한글 이름이 통째로 날아간다. `filenameFromDisposition`이 이미 `filename*` 우선이다.

3줄짜리 TXT를 모드 b·`insertPageNumber=true`로 올려 받은 `.brf`는 26줄이고,
마지막 26번째 줄이 페이지행이었다:

```
1   $ci"<e~l
2   im~),.r .&obcoi
3   ,n~),.r .&
4-25 (빈 줄)
26  #a      ,mja oajo5;ra #a      #a
```

`#a`(원본 쪽번호) · 가운데 점역된 꼬리말 · `#a`(점자 면 번호). 꼬리말이 실제로 조판에
들어가는 것을 눈으로 확인했다.

### 명세가 바뀐 지점 — "수정 시 재처리"가 사라졌다

조판이 braille-assist 라이브러리(로컬 연산)로 옮겨가면서 **항상 DB의 현재 편집본으로 즉시
생성**된다. 예전 명세의 "수정 이력이 있으면 AI 조판 재처리(수 초)" 분기는 없다.
대신 FE 책임이 하나 생긴다 — **다운로드 전에 페이지 일괄 저장을 먼저 끝내야 한다.**
FE 메모리에만 있는 미저장 편집분은 파일에 반영되지 않는다
(`handleDownloadFile`이 `editor.saveAllDirty()`를 먼저 호출하고 있어 계약은 이미 맞다).

다운로드 모달 문구도 "조판 처리를 진행합니다"에서 바꿨다.

### 신설 에러 코드

| HTTP | 코드 | 상황 |
|---|---|---|
| 409 | `JOB4010` | 변환 중(PENDING·IN_PROGRESS) — 기존 코드, 재사용 |
| 400 | `JOB4012` | 다운로드할 변환 결과 없음(FAILED 잡) — **신설** |

`JOB4012`는 FAILED 잡을 만들어야 재현되는데 그럴 방법이 없어 실서버로는 확인하지 못했다.
문구만 `errorMessages`에 넣어 뒀다.

## FE 변경

| 파일 | 내용 |
|---|---|
| `api/JobService.ts` | `createJob`에 `footerText` 파라미터 — 빈 값이면 필드를 아예 보내지 않는다(서버가 null 기록) |
| `api/errorMessages.ts` | `JOB4012` 추가 |
| `utils/fileValidation.ts` | `FOOTER_TEXT_MAX_LENGTH` = 200, `footerTextMessage` |
| `hooks/UseJobUpload.ts` | `footerText` 전달 + 200자 선검증 |
| `App.tsx` | `footerText` 상태 · 탭 스냅샷 · 업로드 옵션 입력창(모드 b·c만) · 작업 복원 시 초기화 |
| `component/features/conversion/DownloadModal.tsx` | "조판 재처리" 문구 제거 |
