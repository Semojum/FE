// 조판 설정은 **작업(파일)마다** 다르다.
//
// 1차 PoC(2026-08-26) 시연에서 정한 모델 그대로다 — "기본적으로는 [점역 기본 설정]에서
// 세팅하신 것들로 계산되고, 그 문서에서만 다른 방식을 적용하고 싶으면 거기에 추가로
// 입력하시면 그게 우선". 즉 마이페이지 기본값은 **새 작업의 초기값**일 뿐이고, 한 번
// 정해진 값은 그 작업에 붙어 다녀야 한다. 규격이 다른 두 파일을 오가며 편집하는 것이
// 정상 사용이라, 작업을 열 때마다 직전 파일의 판면으로 그리면 화면이 파일과 어긋난다.
//
// 서버에는 아직 담을 자리가 없다 — `POST /api/jobs`가 받는 조판 값은
// `insertPageNumber` 하나뿐이다(docs/SERVER-REQUIREMENTS-3.3.0.md S-1). 그래서 이 기기에
// jobId별로 남긴다. S-1이 열리면 이 파일의 읽기·쓰기만 서버 호출로 바꾸면 된다.

import { normalizeTypeset, type TypesetOptions } from './typesetOptions';

const KEY = 'semojum.jobTypeset';

// 작업은 계속 쌓이지만 이 값은 몇 백 바이트짜리라 상한만 둔다. 넘치면 오래
// 쓴 작업부터 버린다 — 버려져도 기본값으로 열릴 뿐이라 잃는 것이 없다.
const KEEP = 200;

type Store = Record<string, TypesetOptions>;

const read = (): Store => {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (!parsed || typeof parsed !== 'object') return {};
    return parsed as Store;
  } catch {
    // 저장소를 못 읽는 환경(권한·손상)에서도 앱은 기본값으로 그대로 뜬다.
    return {};
  }
};

const write = (store: Store): void => {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(store));
  } catch {
    /* 저장 실패는 이번 실행에만 영향을 준다 — 다음에 열면 기본값이다. */
  }
};

/** 이 작업에 정해 둔 조판 설정. 없으면 null — 호출부가 기본 설정으로 연다. */
export const loadJobTypeset = (jobId: string): TypesetOptions | null => {
  const found = read()[jobId];
  // 저장된 값이 낡았거나 손상돼도 normalizeTypeset이 범위 안으로 되돌린다.
  return found ? normalizeTypeset(found) : null;
};

export const saveJobTypeset = (jobId: string, value: TypesetOptions): void => {
  const store = read();
  // 다시 넣어 **가장 최근**으로 만든다 — 문자열 키는 넣은 순서를 지키므로
  // 앞에서부터 버리면 오래 안 쓴 작업이 먼저 빠진다.
  delete store[jobId];
  store[jobId] = value;
  const keys = Object.keys(store);
  for (const old of keys.slice(0, Math.max(0, keys.length - KEEP))) {
    delete store[old];
  }
  write(store);
};

/** 작업을 지웠을 때 함께 지운다 — 남겨 둬도 해롭진 않지만 쌓일 이유가 없다. */
export const forgetJobTypeset = (jobId: string): void => {
  const store = read();
  if (!(jobId in store)) return;
  delete store[jobId];
  write(store);
};
