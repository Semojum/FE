import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('../../../api/NoticeService', () => ({
  listPublicNotices: vi.fn(),
}));

import NoticePanel from '../auth/NoticePanel';
import LoginScreen from '../auth/LoginScreen';
import { listPublicNotices } from '../../../api/NoticeService';

const notices = [
  {
    id: 'n1',
    title: '8/20 새벽 서버 점검 안내',
    body: '02:00~03:00 점검으로 서비스가 잠시 중단됩니다.',
    startsOn: '2026-08-18',
    endsOn: '2026-08-21',
    createdAt: '2026-08-18T05:35:00',
  },
  {
    id: 'n2',
    title: '3.0.7 업데이트 안내',
    body: '최근 작업 스트립이 추가됐습니다.',
    startsOn: '2026-08-15',
    endsOn: '2026-08-25',
    createdAt: '2026-08-15T00:00:00',
  },
];

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
});

describe('로그인 화면 공지 패널', () => {
  it('노출 중인 공지를 날짜와 함께 목록으로 보여 준다', async () => {
    vi.mocked(listPublicNotices).mockResolvedValue(notices);

    render(<NoticePanel />);

    expect(await screen.findByText('8/20 새벽 서버 점검 안내')).toBeTruthy();
    expect(screen.getByText('3.0.7 업데이트 안내')).toBeTruthy();
    expect(screen.getByText('08-18')).toBeTruthy();
  });

  it('제목을 누르면 본문이 그 자리에서 펼쳐진다 (새 창·추가 조회 없음)', async () => {
    vi.mocked(listPublicNotices).mockResolvedValue(notices);

    render(<NoticePanel />);
    const title = await screen.findByText('8/20 새벽 서버 점검 안내');
    const button = title.closest('button') as HTMLElement;
    expect(button.getAttribute('aria-expanded')).toBe('false');

    await userEvent.click(button);

    expect(button.getAttribute('aria-expanded')).toBe('true');
    expect(
      screen.getByText('02:00~03:00 점검으로 서비스가 잠시 중단됩니다.'),
    ).toBeTruthy();
    expect(listPublicNotices).toHaveBeenCalledTimes(1);

    // 다시 누르면 접힌다.
    await userEvent.click(button);
    expect(
      screen.queryByText('02:00~03:00 점검으로 서비스가 잠시 중단됩니다.'),
    ).toBeNull();
  });

  // 공지가 없어도 패널은 남는다(2026-09-01 요청). 있을 때만 나타나면 화면 폭이
  // 그때그때 달라지고, "공지가 없는 것"과 "공지 자리가 없는 것"을 가릴 수 없다.
  it('공지가 없어도 패널은 그대로 있고, 빈 이유를 적는다', async () => {
    vi.mocked(listPublicNotices).mockResolvedValue([]);
    const { container } = render(<NoticePanel />);
    await waitFor(() => expect(listPublicNotices).toHaveBeenCalled());
    expect(container.querySelector('aside')).not.toBeNull();
    expect(await screen.findByText('등록된 공지가 없습니다.')).toBeTruthy();
  });

  it('못 불러왔을 때는 그렇게 적는다 — 없는 것과 가려야 한다', async () => {
    vi.mocked(listPublicNotices).mockResolvedValue(null);
    const { container } = render(<NoticePanel />);
    await waitFor(() => expect(listPublicNotices).toHaveBeenCalled());
    expect(container.querySelector('aside')).not.toBeNull();
    expect(await screen.findByText('공지를 불러오지 못했습니다.')).toBeTruthy();
  });

  it('로그인 화면에 함께 뜨고, 공지가 없어도 로그인 칸은 그대로다', async () => {
    vi.mocked(listPublicNotices).mockResolvedValue(notices);
    const { unmount } = render(<LoginScreen onLogin={vi.fn()} />);

    expect(await screen.findByText('공지')).toBeTruthy();
    expect(screen.getByPlaceholderText('아이디')).toBeTruthy();
    expect(screen.getByPlaceholderText('비밀번호')).toBeTruthy();
    unmount();

    vi.mocked(listPublicNotices).mockResolvedValue(null);
    render(<LoginScreen onLogin={vi.fn()} />);
    await waitFor(() => expect(listPublicNotices).toHaveBeenCalledTimes(2));
    // 공지를 못 불러와도 패널 자리는 그대로다 — 로그인 칸이 옆으로 밀리지 않는다.
    expect(screen.getByText('공지')).toBeTruthy();
    expect(screen.getByPlaceholderText('아이디')).toBeTruthy();
  });
});
