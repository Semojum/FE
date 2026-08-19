// 마지막으로 로그인에 성공한 아이디를 기억해 다음 실행 때 로그인 화면에 미리 채운다.
//
// 저장하는 것은 아이디뿐이다 — 비밀번호·토큰은 남기지 않는다. V3는 자동 로그인을
// 지원하지 않으므로(로그인 D-3: 기관 계정이 공유될 수 있어 다른 담당자의 작업과
// 섞이면 안 된다) 앱을 다시 켜면 비밀번호는 매번 입력해야 한다. 아이디는
// `kblib01`처럼 기관이 발급한 식별자라 화면에 이미 노출되는 값이다.

const KEY = 'semojum.lastLoginId';

export const readLastLoginId = (): string => {
  try {
    return window.localStorage.getItem(KEY) ?? '';
  } catch {
    // 저장소가 막혀 있어도(프라이빗 모드 등) 로그인 자체는 되어야 한다.
    return '';
  }
};

export const saveLastLoginId = (loginId: string): void => {
  const value = loginId.trim();
  if (!value) return;
  try {
    window.localStorage.setItem(KEY, value);
  } catch {
    // 기억해 두지 못할 뿐이라 조용히 넘어간다.
  }
};
