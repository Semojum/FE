import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import MyPageModal from '../mypage/MyPageModal';
import { mockBackend } from '../../../api/MockBackend';
import type { SaveJobInput } from '../../../types/auth';

const job = (title: string): SaveJobInput => ({
  title,
  mode: 'OCR 변환',
  fileName: 'f.pdf',
  totalPages: 1,
  blocksByPage: {},
  bboxDataByPage: {},
  originalTextsByPage: {},
  imgResolution: { width: 0, height: 0 },
});

describe('MyPageModal', () => {
  let token: string;

  beforeEach(async () => {
    await mockBackend.signup('mp@x.com', 'pw', 'MP');
    const auth = await mockBackend.login('mp@x.com', 'pw');
    token = auth.accessToken;
  });

  it('renders nothing when isOpen=false', () => {
    const { container } = render(
      <MyPageModal
        isOpen={false}
        onClose={vi.fn()}
        token={token}
        onSelect={vi.fn()}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('shows empty state when no jobs', async () => {
    render(
      <MyPageModal
        isOpen={true}
        onClose={vi.fn()}
        token={token}
        onSelect={vi.fn()}
      />,
    );
    await waitFor(() =>
      expect(
        screen.getByText(/저장된 작업이 없습니다/),
      ).toBeInTheDocument(),
    );
  });

  it('lists saved jobs newest first', async () => {
    await mockBackend.saveJob(token, job('첫번째'));
    await new Promise((r) => setTimeout(r, 5));
    await mockBackend.saveJob(token, job('두번째'));

    render(
      <MyPageModal
        isOpen={true}
        onClose={vi.fn()}
        token={token}
        onSelect={vi.fn()}
      />,
    );
    const titles = await screen.findAllByText(/번째/);
    expect(titles[0].textContent).toBe('두번째');
    expect(titles[1].textContent).toBe('첫번째');
  });

  it('clicking a job calls onSelect with its id', async () => {
    const saved = await mockBackend.saveJob(token, job('클릭 대상'));
    const onSelect = vi.fn();
    render(
      <MyPageModal
        isOpen={true}
        onClose={vi.fn()}
        token={token}
        onSelect={onSelect}
      />,
    );
    const item = await screen.findByText('클릭 대상');
    await userEvent.click(item);
    expect(onSelect).toHaveBeenCalledWith(saved.id);
  });

  it('clicking 닫기 fires onClose', async () => {
    const onClose = vi.fn();
    render(
      <MyPageModal
        isOpen={true}
        onClose={onClose}
        token={token}
        onSelect={vi.fn()}
      />,
    );
    await userEvent.click(screen.getByLabelText('닫기'));
    expect(onClose).toHaveBeenCalled();
  });

  it('delete removes job from list (after confirm)', async () => {
    await mockBackend.saveJob(token, job('삭제 대상'));
    vi.stubGlobal('confirm', () => true);

    render(
      <MyPageModal
        isOpen={true}
        onClose={vi.fn()}
        token={token}
        onSelect={vi.fn()}
      />,
    );
    await screen.findByText('삭제 대상');
    await userEvent.click(screen.getByLabelText('작업 삭제'));

    await waitFor(() => {
      expect(screen.queryByText('삭제 대상')).not.toBeInTheDocument();
    });
    vi.unstubAllGlobals();
  });

  it('shows error when token is invalid', async () => {
    render(
      <MyPageModal
        isOpen={true}
        onClose={vi.fn()}
        token="bogus"
        onSelect={vi.fn()}
      />,
    );
    expect(await screen.findByText(/인증이 만료/)).toBeInTheDocument();
  });
});
