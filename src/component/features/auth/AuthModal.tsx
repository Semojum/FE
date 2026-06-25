import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Loader2 } from 'lucide-react';
import { OAuthProvider } from '../../../types/auth';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onLogin: (email: string, password: string) => Promise<void>;
  onSignup: (
    email: string,
    password: string,
    name: string,
  ) => Promise<void>;
  // 소셜 로그인 시작(데스크톱 loopback 플로우)은 상위에서 처리
  onOAuthLogin: (provider: OAuthProvider) => void | Promise<void>;
  isAuthorizing?: boolean;
  // 소셜 로그인 등 외부에서 발생한 에러를 표시하기 위한 메시지
  externalError?: string | null;
  // false면 닫기(X)를 비활성화한다 — 로그인 게이트처럼 닫을 수 없는 경우.
  dismissible?: boolean;
}

// 디자인 토큰(Figma: Semojum 로그인/회원가입) — primary blue #5b8ce6
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// 입력 필드 공통 스타일 — 디자인의 알약형(rounded) 인풋.
const inputCls =
  'h-[42px] w-full rounded-full border border-gray-200 bg-white px-5 text-sm text-gray-700 placeholder:text-[#adadad] shadow-sm transition-colors focus:border-[#5b8ce6] focus:outline-none';

const AuthModal: React.FC<Props> = ({
  isOpen,
  onClose,
  onLogin,
  onSignup,
  onOAuthLogin,
  isAuthorizing,
  externalError,
  dismissible = true,
}) => {
  const [tab, setTab] = useState<'login' | 'signup'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // 이메일 중복확인 결과. 전용 API가 없어 형식 검증으로 대체한다(아래 handleCheckEmail).
  const [emailCheck, setEmailCheck] = useState<'valid' | 'invalid' | null>(null);

  // 외부 에러(소셜 로그인 콜백 실패 등)를 모달 에러로 반영
  useEffect(() => {
    if (externalError) setError(externalError);
  }, [externalError]);

  if (!isOpen) return null;

  const reset = () => {
    setEmail('');
    setPassword('');
    setName('');
    setError(null);
    setEmailCheck(null);
  };

  const handleSwitch = (next: 'login' | 'signup') => {
    setTab(next);
    setError(null);
    setEmailCheck(null);
  };

  // 소셜 로그인 시작은 상위(useOAuth)에 위임. 결과/에러는 externalError로 전달됨.
  const handleOAuth = (provider: OAuthProvider) => {
    setError(null);
    void onOAuthLogin(provider);
  };

  // 이메일 중복확인: 전용 백엔드 엔드포인트가 없어 형식만 검증해 사용 가능 여부를 표시한다.
  // 서버 측 중복 검사 API가 생기면 이 핸들러를 해당 호출로 교체하면 된다.
  const handleCheckEmail = () => {
    setEmailCheck(EMAIL_RE.test(email.trim()) ? 'valid' : 'invalid');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      if (tab === 'login') {
        await onLogin(email, password);
      } else {
        await onSignup(email, password, name);
      }
      reset();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : '오류가 발생했습니다.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // ─── 로그인 화면 (Figma node 13:120) ───────────────────────────────
  const loginView = (
    <form
      onSubmit={handleSubmit}
      className="min-h-full flex flex-col items-center justify-center px-4 py-16"
    >
      <img
        src="semojum-symbol.png"
        alt="세모점"
        className="w-[140px] h-[140px] object-contain mb-10 select-none"
      />

      <div className="w-full max-w-[366px] flex flex-col gap-3">
        <input
          type="email"
          placeholder="이메일 주소"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          autoFocus
          className={inputCls}
        />
        <input
          type="password"
          placeholder="비밀번호"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          minLength={4}
          className={inputCls}
        />

        {error && <p className="px-2 text-sm text-red-500">{error}</p>}

        <button
          type="submit"
          disabled={isSubmitting}
          className="mt-1 flex h-[42px] items-center justify-center gap-2 rounded-full bg-[#5b8ce6] text-sm font-semibold text-white transition-colors hover:bg-[#4a7bd4] disabled:opacity-50"
        >
          {isSubmitting && <Loader2 className="animate-spin" size={16} />}
          로그인
        </button>

        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => handleSwitch('signup')}
            className="text-sm font-semibold text-[#919191] transition-colors hover:text-[#5b8ce6]"
          >
            회원가입
          </button>
        </div>
      </div>

      <div className="my-6 h-px w-full max-w-[411px] bg-gray-200" />

      <div className="flex items-center gap-[17px]">
        <button
          type="button"
          onClick={() => handleOAuth('kakao')}
          disabled={isAuthorizing}
          aria-label="카카오로 계속하기"
          className="size-[60px] rounded-full transition hover:brightness-95 disabled:opacity-50"
        >
          <img
            src="icon-kakao.svg"
            alt=""
            className="size-full pointer-events-none"
          />
        </button>
        <button
          type="button"
          onClick={() => handleOAuth('google')}
          disabled={isAuthorizing}
          aria-label="Google로 계속하기"
          className="size-[60px] rounded-full border border-gray-200 transition hover:brightness-95 disabled:opacity-50"
        >
          <img
            src="icon-google.svg"
            alt=""
            className="size-full pointer-events-none"
          />
        </button>
      </div>
    </form>
  );

  // ─── 회원가입 화면 (Figma node 46:124) ─────────────────────────────
  const signupView = (
    <div className="min-h-full px-6 py-10 md:px-12">
      <img
        src="semojum-wordmark.png"
        alt="세모점"
        className="h-[44px] w-auto object-contain select-none"
      />

      <div className="mt-8 flex items-end border-b border-gray-200">
        <div className="flex flex-col items-center">
          <span className="px-5 pb-2 text-[18px] font-bold text-[#5b8ce6]">
            회원가입
          </span>
          <span className="h-[2px] w-full bg-[#5b8ce6]" />
        </div>
        <button
          type="button"
          onClick={() => handleSwitch('login')}
          className="ml-auto pb-3 text-sm font-medium text-[#919191] transition-colors hover:text-[#5b8ce6]"
        >
          로그인
        </button>
      </div>

      <form
        onSubmit={handleSubmit}
        className="mx-auto mt-12 flex max-w-[450px] flex-col gap-5 md:ml-[120px]"
      >
        <div>
          <label className="mb-2 block text-sm font-medium text-[#828282]">
            이름
          </label>
          <input
            type="text"
            placeholder="이름을 입력하세요"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            autoFocus
            className={inputCls}
          />
        </div>

        <div>
          <label className="mb-2 block text-sm font-medium text-[#828282]">
            이메일
          </label>
          <div className="flex items-center gap-3">
            <input
              type="email"
              placeholder="이메일을 입력하세요"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                setEmailCheck(null);
              }}
              required
              className={`${inputCls} flex-1`}
            />
            <button
              type="button"
              onClick={handleCheckEmail}
              className="h-[38px] shrink-0 rounded-[10px] bg-[#f47726] px-4 text-sm font-medium text-white transition hover:brightness-95"
            >
              중복확인
            </button>
          </div>
          {emailCheck === 'valid' && (
            <p className="mt-1.5 text-[11px] font-medium text-[#34c759]">
              사용 가능한 이메일입니다.
            </p>
          )}
          {emailCheck === 'invalid' && (
            <p className="mt-1.5 text-[11px] font-medium text-[#ff3b30]">
              사용 불가능한 이메일입니다.
            </p>
          )}
        </div>

        <div>
          <label className="mb-2 block text-sm font-medium text-[#828282]">
            비밀번호
          </label>
          <input
            type="password"
            placeholder="비밀번호를 입력하세요"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={4}
            className={inputCls}
          />
        </div>

        {error && <p className="text-sm text-red-500">{error}</p>}

        <div className="flex justify-end pt-2">
          <button
            type="submit"
            disabled={isSubmitting}
            className="flex h-[38px] items-center justify-center gap-2 rounded-full bg-[#5b8ce6] px-8 text-sm font-medium text-white transition-colors hover:bg-[#4a7bd4] disabled:opacity-50"
          >
            {isSubmitting && <Loader2 className="animate-spin" size={16} />}
            계정 만들기
          </button>
        </div>
      </form>
    </div>
  );

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 overflow-y-auto bg-[#f8f9fa]"
      >
        {dismissible && (
          <button
            onClick={onClose}
            className="absolute right-5 top-5 z-10 rounded-full p-2 text-gray-500 transition-colors hover:bg-gray-200/60"
            aria-label="닫기"
          >
            <X size={20} />
          </button>
        )}
        {tab === 'login' ? loginView : signupView}
      </motion.div>
    </AnimatePresence>
  );
};

export default AuthModal;
