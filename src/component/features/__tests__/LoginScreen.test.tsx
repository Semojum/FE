import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// 로그인 화면에 붙은 공지 패널은 마운트되자마자 공개 공지를 부른다 —
// 이 파일의 관심사가 아니고 네트워크도 타므로 막아 둔다(공지 없음 = 패널 숨김).
vi.mock('../../../api/NoticeService', () => ({
  listPublicNotices: vi.fn().mockResolvedValue(null),
}));

import LoginScreen from '../auth/LoginScreen';

// 아이디는 기억해 두고 다음 실행 때 미리 채운다. 비밀번호는 저장하지 않으므로
// (V3는 자동 로그인이 없다) 아이디가 채워져 있으면 커서는 비밀번호 칸에서 시작한다.

beforeEach(() => {
  localStorage.clear();
});

describe('LoginScreen · 아이디 기억', () => {
  it('저장된 아이디가 있으면 아이디 칸에 미리 채우고 커서는 비밀번호 칸에 둔다', () => {
    localStorage.setItem('semojum.lastLoginId', 'kblib01');

    render(<LoginScreen onLogin={vi.fn()} />);

    expect(screen.getByPlaceholderText('아이디')).toHaveValue('kblib01');
    expect(screen.getByPlaceholderText('비밀번호')).toHaveFocus();
  });

  it('저장된 아이디가 없으면 빈 칸에서 아이디부터 입력받는다', () => {
    render(<LoginScreen onLogin={vi.fn()} />);

    const id = screen.getByPlaceholderText('아이디');
    expect(id).toHaveValue('');
    expect(id).toHaveFocus();
  });

  it('채워진 아이디를 지우고 다른 아이디로 로그인할 수 있다', async () => {
    localStorage.setItem('semojum.lastLoginId', 'kblib01');
    const onLogin = vi.fn().mockResolvedValue(undefined);

    render(<LoginScreen onLogin={onLogin} />);

    const id = screen.getByPlaceholderText('아이디');
    await userEvent.clear(id);
    await userEvent.type(id, 'kblib02');
    await userEvent.type(screen.getByPlaceholderText('비밀번호'), 'pw');
    await userEvent.click(screen.getByRole('button', { name: '로그인' }));

    expect(onLogin).toHaveBeenCalledWith('kblib02', 'pw');
  });
});
