import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import MyPageModal from '../mypage/MyPageModal';
import type { JobSummary } from '../../../types/auth';

// 실 이력 API(listJobs)를 모킹한다.
vi.mock('../../../api/HistoryService', () => ({
  listJobs: vi.fn(),
}));
import { listJobs } from '../../../api/HistoryService';

const summary = (overrides: Partial<JobSummary> = {}): JobSummary => ({
  jobId: 'job_1',
  mode: 'a',
  status: 'COMPLETED',
  totalPages: 3,
  failedPages: [],
  originalFileName: '교과서.pdf',
  startedAt: '2026-06-02T23:31:55',
  finishedAt: '2026-06-02T23:45:00',
  ...overrides,
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe('MyPageModal', () => {
  it('renders nothing when isOpen=false', () => {
    vi.mocked(listJobs).mockResolvedValue([]);
    const { container } = render(
      <MyPageModal
        isOpen={false}
        onClose={vi.fn()}
        token="t"
        onSelect={vi.fn()}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('shows empty state when no jobs', async () => {
    vi.mocked(listJobs).mockResolvedValue([]);
    render(
      <MyPageModal isOpen onClose={vi.fn()} token="t" onSelect={vi.fn()} />,
    );
    await waitFor(() =>
      expect(screen.getByText(/저장된 작업이 없습니다/)).toBeInTheDocument(),
    );
  });

  it('lists jobs with original file name + mode label', async () => {
    vi.mocked(listJobs).mockResolvedValue([
      summary({ jobId: 'j1', originalFileName: '첫번째.pdf', mode: 'a' }),
      summary({ jobId: 'j2', originalFileName: '두번째.txt', mode: 'b' }),
    ]);
    render(
      <MyPageModal isOpen onClose={vi.fn()} token="t" onSelect={vi.fn()} />,
    );
    expect(await screen.findByText('첫번째.pdf')).toBeInTheDocument();
    expect(screen.getByText('두번째.txt')).toBeInTheDocument();
    expect(screen.getByText('초안 생성')).toBeInTheDocument();
    expect(screen.getByText('텍스트 점자 번역')).toBeInTheDocument();
  });

  it('clicking a job calls onSelect with the JobSummary', async () => {
    const job = summary({ jobId: 'click-target', originalFileName: '클릭대상.pdf' });
    vi.mocked(listJobs).mockResolvedValue([job]);
    const onSelect = vi.fn();
    render(
      <MyPageModal isOpen onClose={vi.fn()} token="t" onSelect={onSelect} />,
    );
    const item = await screen.findByText('클릭대상.pdf');
    await userEvent.click(item);
    expect(onSelect).toHaveBeenCalledWith(job);
  });

  it('clicking 닫기 fires onClose', async () => {
    vi.mocked(listJobs).mockResolvedValue([]);
    const onClose = vi.fn();
    render(
      <MyPageModal isOpen onClose={onClose} token="t" onSelect={vi.fn()} />,
    );
    await userEvent.click(screen.getByLabelText('닫기'));
    expect(onClose).toHaveBeenCalled();
  });

  it('shows error message when listJobs rejects', async () => {
    vi.mocked(listJobs).mockRejectedValue(new Error('인증이 만료되었습니다.'));
    render(
      <MyPageModal isOpen onClose={vi.fn()} token="bogus" onSelect={vi.fn()} />,
    );
    expect(await screen.findByText(/인증이 만료/)).toBeInTheDocument();
  });
});
