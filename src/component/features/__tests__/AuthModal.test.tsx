import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AuthModal from '../auth/AuthModal';

// 이메일 중복확인 API(checkEmail)를 모킹한다.
vi.mock('../../../api/AuthService', () => ({
  checkEmail: vi.fn(),
}));
import { checkEmail } from '../../../api/AuthService';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('AuthModal', () => {
  it('renders nothing when isOpen=false', () => {
    const { container } = render(
      <AuthModal
        isOpen={false}
        onClose={vi.fn()}
        onLogin={vi.fn().mockResolvedValue(undefined)}
        onSignup={vi.fn().mockResolvedValue(undefined)}
        onOAuthLogin={vi.fn()}
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
        onOAuthLogin={vi.fn()}
      />,
    );
    expect(screen.getByPlaceholderText('이메일 주소')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('비밀번호')).toBeInTheDocument();
    expect(
      screen.queryByPlaceholderText('이름을 입력하세요'),
    ).not.toBeInTheDocument();
  });

  it('switching to signup reveals name input', async () => {
    render(
      <AuthModal
        isOpen={true}
        onClose={vi.fn()}
        onLogin={vi.fn().mockResolvedValue(undefined)}
        onSignup={vi.fn().mockResolvedValue(undefined)}
        onOAuthLogin={vi.fn()}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: '회원가입' }));
    expect(screen.getByPlaceholderText('이름을 입력하세요')).toBeInTheDocument();
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
        onOAuthLogin={vi.fn()}
      />,
    );
    await userEvent.type(screen.getByPlaceholderText('이메일 주소'), 'a@b.com');
    await userEvent.type(screen.getByPlaceholderText('비밀번호'), '1234');
    await userEvent.click(screen.getByRole('button', { name: '로그인' }));
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
        onOAuthLogin={vi.fn()}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: '회원가입' }));
    await userEvent.type(
      screen.getByPlaceholderText('이름을 입력하세요'),
      '홍길동',
    );
    await userEvent.type(
      screen.getByPlaceholderText('이메일을 입력하세요'),
      'hong@x.com',
    );
    await userEvent.type(
      screen.getByPlaceholderText('비밀번호를 입력하세요'),
      'pw12',
    );
    await userEvent.click(screen.getByRole('button', { name: '계정 만들기' }));
    expect(onSignup).toHaveBeenCalledWith('hong@x.com', 'pw12', '홍길동');
  });

  it('email 중복확인 shows available message when API returns available=true', async () => {
    vi.mocked(checkEmail).mockResolvedValue({ available: true });
    render(
      <AuthModal
        isOpen={true}
        onClose={vi.fn()}
        onLogin={vi.fn().mockResolvedValue(undefined)}
        onSignup={vi.fn().mockResolvedValue(undefined)}
        onOAuthLogin={vi.fn()}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: '회원가입' }));
    await userEvent.type(
      screen.getByPlaceholderText('이메일을 입력하세요'),
      'good@x.com',
    );
    await userEvent.click(screen.getByRole('button', { name: '중복확인' }));
    expect(
      await screen.findByText('사용 가능한 이메일입니다.'),
    ).toBeInTheDocument();
    expect(checkEmail).toHaveBeenCalledWith('good@x.com');
  });

  it('email 중복확인 shows unavailable message when API returns available=false', async () => {
    vi.mocked(checkEmail).mockResolvedValue({ available: false });
    render(
      <AuthModal
        isOpen={true}
        onClose={vi.fn()}
        onLogin={vi.fn().mockResolvedValue(undefined)}
        onSignup={vi.fn().mockResolvedValue(undefined)}
        onOAuthLogin={vi.fn()}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: '회원가입' }));
    await userEvent.type(
      screen.getByPlaceholderText('이메일을 입력하세요'),
      'dup@x.com',
    );
    await userEvent.click(screen.getByRole('button', { name: '중복확인' }));
    expect(
      await screen.findByText('사용 불가능한 이메일입니다.'),
    ).toBeInTheDocument();
  });

  it('email 중복확인 rejects invalid format without calling the API', async () => {
    render(
      <AuthModal
        isOpen={true}
        onClose={vi.fn()}
        onLogin={vi.fn().mockResolvedValue(undefined)}
        onSignup={vi.fn().mockResolvedValue(undefined)}
        onOAuthLogin={vi.fn()}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: '회원가입' }));
    await userEvent.type(
      screen.getByPlaceholderText('이메일을 입력하세요'),
      'not-an-email',
    );
    await userEvent.click(screen.getByRole('button', { name: '중복확인' }));
    expect(
      await screen.findByText('사용 불가능한 이메일입니다.'),
    ).toBeInTheDocument();
    expect(checkEmail).not.toHaveBeenCalled();
  });

  it('switching tabs clears the entered credentials', async () => {
    render(
      <AuthModal
        isOpen={true}
        onClose={vi.fn()}
        onLogin={vi.fn().mockResolvedValue(undefined)}
        onSignup={vi.fn().mockResolvedValue(undefined)}
        onOAuthLogin={vi.fn()}
      />,
    );
    await userEvent.type(screen.getByPlaceholderText('이메일 주소'), 'a@b.com');
    await userEvent.type(screen.getByPlaceholderText('비밀번호'), 'secret');
    await userEvent.click(screen.getByRole('button', { name: '회원가입' }));
    expect(screen.getByPlaceholderText('이메일을 입력하세요')).toHaveValue('');
    expect(screen.getByPlaceholderText('비밀번호를 입력하세요')).toHaveValue('');
  });

  it('renders error message when onLogin throws', async () => {
    const onLogin = vi.fn().mockRejectedValue(new Error('비밀번호 오류'));
    render(
      <AuthModal
        isOpen={true}
        onClose={vi.fn()}
        onLogin={onLogin}
        onSignup={vi.fn().mockResolvedValue(undefined)}
        onOAuthLogin={vi.fn()}
      />,
    );
    await userEvent.type(screen.getByPlaceholderText('이메일 주소'), 'a@b.com');
    await userEvent.type(screen.getByPlaceholderText('비밀번호'), 'badpw');
    await userEvent.click(screen.getByRole('button', { name: '로그인' }));
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
        onOAuthLogin={vi.fn()}
      />,
    );
    await userEvent.click(screen.getByLabelText('닫기'));
    expect(onClose).toHaveBeenCalled();
  });
});
