import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { UpdateReadyToast } from '../update/UpdateGate';

// 새 버전 알림은 닫아도 사라지지 않는다 — 접힌 칩으로 남고 다시 펼 수 있다.
// 예전에는 닫으면 그 세션에서 다시 뜰 길이 없어, 무심코 닫은 사람은 앱을 껐다 켜기
// 전까지 업데이트가 있다는 사실 자체를 알 수 없었다(2026-09-01 요청).

describe('새 버전 알림', () => {
  it('펼친 상태에서는 버전과 설치 버튼을 보여 준다', () => {
    render(
      <UpdateReadyToast version="3.2.3" onInstall={vi.fn()} onDismiss={vi.fn()} />,
    );
    expect(screen.getByText(/새 버전이 준비되었습니다/)).toBeTruthy();
    expect(screen.getByText(/v3\.2\.3/)).toBeTruthy();
    expect(screen.getByRole('button', { name: '지금 설치' })).toBeTruthy();
  });

  it('닫으면 접힌 칩이 남는다 — 사라지지 않는다', () => {
    render(
      <UpdateReadyToast
        version="3.2.3"
        collapsed
        onInstall={vi.fn()}
        onDismiss={vi.fn()}
        onExpand={vi.fn()}
      />,
    );
    // 안내 문구는 접혀 사라지지만 진입점은 남는다.
    expect(screen.queryByText(/새 버전이 준비되었습니다/)).toBeNull();
    expect(screen.getByRole('button', { name: /새 버전 v3\.2\.3/ })).toBeTruthy();
  });

  it('접힌 칩을 누르면 다시 펴진다', async () => {
    const onExpand = vi.fn();
    render(
      <UpdateReadyToast
        version="3.2.3"
        collapsed
        onInstall={vi.fn()}
        onDismiss={vi.fn()}
        onExpand={onExpand}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: /새 버전/ }));
    expect(onExpand).toHaveBeenCalled();
  });

  it('설치 중에는 설치 버튼을 다시 누를 수 없다', () => {
    render(
      <UpdateReadyToast
        version="3.2.3"
        busy
        onInstall={vi.fn()}
        onDismiss={vi.fn()}
      />,
    );
    const btn = screen.getByRole('button', { name: '설치 중...' });
    expect((btn as HTMLButtonElement).disabled).toBe(true);
  });

  it('버전을 모를 때도 뜬다 — 알림 자체가 사라지면 안 된다', () => {
    render(
      <UpdateReadyToast version={null} onInstall={vi.fn()} onDismiss={vi.fn()} />,
    );
    expect(screen.getByText('새 버전이 준비되었습니다')).toBeTruthy();
  });
});
