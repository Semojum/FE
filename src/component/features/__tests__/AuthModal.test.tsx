import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AuthModal from '../auth/AuthModal';

describe('AuthModal', () => {
  it('renders nothing when isOpen=false', () => {
    const { container } = render(
      <AuthModal
        isOpen={false}
        onClose={vi.fn()}
        onLogin={vi.fn().mockResolvedValue(undefined)}
        onSignup={vi.fn().mockResolvedValue(undefined)}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('shows login form by default', () => {
    render(
      <AuthModal
        isOpen={true}
        onClose={vi.fn()}
        onLogin={vi.fn().mockResolvedValue(undefined)}
        onSignup={vi.fn().mockResolvedValue(undefined)}
      />,
    );
    expect(screen.getByPlaceholderText('이메일')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('비밀번호')).toBeInTheDocument();
    expect(screen.queryByPlaceholderText('이름')).not.toBeInTheDocument();
  });

  it('switching to signup tab reveals name input', async () => {
    render(
      <AuthModal
        isOpen={true}
        onClose={vi.fn()}
        onLogin={vi.fn().mockResolvedValue(undefined)}
        onSignup={vi.fn().mockResolvedValue(undefined)}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: '회원가입' }));
    expect(screen.getByPlaceholderText('이름')).toBeInTheDocument();
  });

  it('submitting login form calls onLogin and onClose', async () => {
    const onLogin = vi.fn().mockResolvedValue(undefined);
    const onClose = vi.fn();
    render(
      <AuthModal
        isOpen={true}
        onClose={onClose}
        onLogin={onLogin}
        onSignup={vi.fn().mockResolvedValue(undefined)}
      />,
    );
    await userEvent.type(screen.getByPlaceholderText('이메일'), 'a@b.com');
    await userEvent.type(screen.getByPlaceholderText('비밀번호'), '1234');
    // The submit button at the bottom shares text "로그인" with the tab button.
    // Use form submit by clicking the visible submit (the last "로그인" button).
    const submitButtons = screen.getAllByRole('button', { name: '로그인' });
    await userEvent.click(submitButtons[submitButtons.length - 1]);
    expect(onLogin).toHaveBeenCalledWith('a@b.com', '1234');
    expect(onClose).toHaveBeenCalled();
  });

  it('submitting signup form calls onSignup with all 3 fields', async () => {
    const onSignup = vi.fn().mockResolvedValue(undefined);
    render(
      <AuthModal
        isOpen={true}
        onClose={vi.fn()}
        onLogin={vi.fn().mockResolvedValue(undefined)}
        onSignup={onSignup}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: '회원가입' }));
    await userEvent.type(screen.getByPlaceholderText('이름'), '홍길동');
    await userEvent.type(screen.getByPlaceholderText('이메일'), 'hong@x.com');
    await userEvent.type(screen.getByPlaceholderText('비밀번호'), 'pw12');
    const submitButtons = screen.getAllByRole('button', { name: '회원가입' });
    await userEvent.click(submitButtons[submitButtons.length - 1]);
    expect(onSignup).toHaveBeenCalledWith('hong@x.com', 'pw12', '홍길동');
  });

  it('renders error message when onLogin throws', async () => {
    const onLogin = vi.fn().mockRejectedValue(new Error('비밀번호 오류'));
    render(
      <AuthModal
        isOpen={true}
        onClose={vi.fn()}
        onLogin={onLogin}
        onSignup={vi.fn().mockResolvedValue(undefined)}
      />,
    );
    await userEvent.type(screen.getByPlaceholderText('이메일'), 'a@b.com');
    await userEvent.type(screen.getByPlaceholderText('비밀번호'), 'badpw');
    const submitButtons = screen.getAllByRole('button', { name: '로그인' });
    await userEvent.click(submitButtons[submitButtons.length - 1]);
    expect(await screen.findByText('비밀번호 오류')).toBeInTheDocument();
  });

  it('clicking 닫기 fires onClose', async () => {
    const onClose = vi.fn();
    render(
      <AuthModal
        isOpen={true}
        onClose={onClose}
        onLogin={vi.fn().mockResolvedValue(undefined)}
        onSignup={vi.fn().mockResolvedValue(undefined)}
      />,
    );
    await userEvent.click(screen.getByLabelText('닫기'));
    expect(onClose).toHaveBeenCalled();
  });
});
