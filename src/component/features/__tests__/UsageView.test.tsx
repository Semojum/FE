import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// Figma V3-06 사용량(T3). 로그인한 모든 계정이 본다.
// 열람 범위(기획 확정): 내 사용량 + 기관 전체·잔여까지 — 다른 계정이 각각 얼마를
// 썼는지는 서버가 주지 않는다.

vi.mock('../../../api/UsageService', () => ({
  getUsageSummary: vi.fn(),
  listUsageJobs: vi.fn(),
}));

import UsageView from '../org/UsageView';
import { getUsageSummary, listUsageJobs } from '../../../api/UsageService';
import { loadBrailleDefaults } from '../../../utils/brailleDefaults';

const summary = {
  month: '2026-08',
  myCredits: 1140,
  orgAllocated: 10000,
  orgUsed: 4600,
  orgRemaining: 5400,
};

const jobs = {
  from: '2026-07-20',
  to: '2026-08-19',
  items: [
    {
      jobId: 'job_1',
      fileName: '수능특강_생명II.pdf',
      mode: 'c' as const,
      status: 'COMPLETED' as const,
      totalPages: 14,
      donePages: null,
      failedPages: 3,
      credits: 11,
      finishedAt: '2026-08-13T10:24:25',
    },
    {
      jobId: 'job_2',
      fileName: '모의고사_수학.pdf',
      mode: 'c' as const,
      status: 'IN_PROGRESS' as const,
      totalPages: 36,
      donePages: 20,
      failedPages: null,
      credits: null,
      finishedAt: null,
    },
  ],
  totalCredits: 39,
};

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  vi.mocked(getUsageSummary).mockResolvedValue(summary);
  vi.mocked(listUsageJobs).mockResolvedValue(jobs);
});

const renderView = (onOpenJob = vi.fn()) => {
  const utils = render(
    <UsageView
      token="tk"
      loginId="kblib02"
      onBack={vi.fn()}
      onOpenJob={onOpenJob}
      onToast={vi.fn()}
    />,
  );
  return { ...utils, onOpenJob };
};

describe('사용량 (V3-06 T3)', () => {
  it('내 크레딧과 기관 잔여를 함께 보여 준다', async () => {
    renderView();

    // 큰 숫자와 막대 아래 요약에 같은 값이 두 번 나온다.
    expect((await screen.findAllByText('1,140')).length).toBeGreaterThan(0);
    expect(screen.getByText('5,400')).toBeTruthy();
    expect(screen.getByText('기관 할당 10,000 중 11%')).toBeTruthy();
    expect(
      screen.getByText('기관 전체 기준 (계정별 소모량은 표시하지 않음)'),
    ).toBeTruthy();
  });

  // 기본은 이번 달(month 미지정 = 서버 KST 기준), 드롭다운으로 지난 달을 고른다.
  it('달을 고르면 요약과 작업 목록을 그 달로 다시 부른다', async () => {
    renderView();
    await waitFor(() =>
      expect(getUsageSummary).toHaveBeenCalledWith('tk', undefined),
    );

    const select = screen.getByLabelText('조회할 달') as HTMLSelectElement;
    const lastMonth = select.options[1].value;
    await userEvent.selectOptions(select, lastMonth);

    await waitFor(() =>
      expect(getUsageSummary).toHaveBeenLastCalledWith('tk', lastMonth),
    );
    await waitFor(() =>
      expect(listUsageJobs).toHaveBeenLastCalledWith('tk', {
        from: `${lastMonth}-01`,
        to: expect.stringMatching(new RegExp(`^${lastMonth}-\\d{2}$`)),
      }),
    );
  });

  it('끝난 작업에 실패한 쪽이 있으면 부분 실패로, 진행 중이면 진척으로 읽힌다', async () => {
    renderView();

    const done = (await screen.findByText('수능특강_생명II.pdf')).closest('tr');
    expect(within(done as HTMLElement).getByText('부분 실패 3쪽')).toBeTruthy();
    // 진행 중이면 크레딧이 확정되지 않아 —로 둔다.
    const running = screen.getByText('모의고사_수학.pdf').closest('tr');
    expect(
      within(running as HTMLElement).getByText('진행 중 20/36'),
    ).toBeTruthy();
  });

  it('변환 중인 작업은 열 수 없고, 끝난 작업은 에디터로 넘긴다', async () => {
    const { onOpenJob } = renderView();

    const running = (await screen.findByText('모의고사_수학.pdf')).closest(
      'tr',
    );
    expect(
      within(running as HTMLElement).getByRole('button', { name: '열기' }),
    ).toHaveProperty('disabled', true);

    const done = screen.getByText('수능특강_생명II.pdf').closest('tr');
    await userEvent.click(
      within(done as HTMLElement).getByRole('button', { name: '열기' }),
    );
    expect(onOpenJob).toHaveBeenCalledWith(
      expect.objectContaining({ jobId: 'job_1' }),
    );
  });

  it('점역 기본 설정을 저장하면 다음 작업이 그 값으로 시작한다', async () => {
    renderView();

    await userEvent.selectOptions(
      await screen.findByLabelText('기본 변환 모드'),
      'b',
    );
    await userEvent.type(screen.getByLabelText('꼬리말 기본 문구'), '수학 1권');
    await userEvent.click(screen.getByText('설정 저장'));

    expect(loadBrailleDefaults()).toMatchObject({
      defaultMode: 'b',
      footerText: '수학 1권',
    });
  });

  // 1차 PoC(2026-08-26) 요청 — 규격·페이지행 범위·표지 제외를 여기서 정한다.
  it('조판 설정도 함께 저장한다', async () => {
    renderView();

    await userEvent.click(await screen.findByRole('button', { name: '모든 페이지' }));
    const cols = screen.getByLabelText('칸 수');
    await userEvent.clear(cols);
    await userEvent.type(cols, '40');
    await userEvent.click(screen.getByText('설정 저장'));

    expect(loadBrailleDefaults().typeset).toMatchObject({
      pageRowOn: 'every',
      cols: 40,
      rows: 26,
    });
    // 구 필드는 조판 설정에서 파생한다 — 둘이 어긋날 자리를 없앴다.
    expect(loadBrailleDefaults().insertPageNumber).toBe(true);
  });
});
