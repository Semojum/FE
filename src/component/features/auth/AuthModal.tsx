import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Loader2 } from 'lucide-react';
import { getOAuthUrl, OAuthProvider } from '../../../api/AuthService';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onLogin: (email: string, password: string) => Promise<void>;
  onSignup: (
    email: string,
    password: string,
    name: string,
  ) => Promise<void>;
}

const AuthModal: React.FC<Props> = ({
  isOpen,
  onClose,
  onLogin,
  onSignup,
}) => {
  const [tab, setTab] = useState<'login' | 'signup'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const reset = () => {
    setEmail('');
    setPassword('');
    setName('');
    setError(null);
  };

  const handleSwitch = (next: 'login' | 'signup') => {
    setTab(next);
    setError(null);
  };

  // 소셜 로그인은 브라우저를 직접 이동시킨다 (서버가 OAuth 핸드셰이크 후 콜백으로 리다이렉트).
  const handleOAuth = (provider: OAuthProvider) => {
    window.location.href = getOAuthUrl(provider);
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

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="absolute inset-0 bg-black/30 backdrop-blur-sm"
        />
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 10 }}
          className="relative bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden border border-gray-100"
        >
          <div className="flex justify-between items-center p-4 border-b border-gray-100">
            <div className="flex gap-4">
              <button
                onClick={() => handleSwitch('login')}
                className={`pb-1 font-semibold transition-colors ${
                  tab === 'login'
                    ? 'text-[#407FAC] border-b-2 border-[#407FAC]'
                    : 'text-gray-400'
                }`}
              >
                로그인
              </button>
              <button
                onClick={() => handleSwitch('signup')}
                className={`pb-1 font-semibold transition-colors ${
                  tab === 'signup'
                    ? 'text-[#407FAC] border-b-2 border-[#407FAC]'
                    : 'text-gray-400'
                }`}
              >
                회원가입
              </button>
            </div>
            <button
              onClick={onClose}
              className="p-1 hover:bg-gray-100 rounded-full transition-colors"
              aria-label="닫기"
            >
              <X size={18} className="text-gray-500" />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="p-6 space-y-4">
            {tab === 'signup' && (
              <input
                type="text"
                placeholder="이름"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                autoFocus
                className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-[#407FAC]"
              />
            )}
            <input
              type="email"
              placeholder="이메일"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoFocus={tab === 'login'}
              className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-[#407FAC]"
            />
            <input
              type="password"
              placeholder="비밀번호"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={4}
              className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-[#407FAC]"
            />

            {error && <p className="text-sm text-red-500">{error}</p>}

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full bg-[#407FAC] text-white py-2 rounded-lg font-semibold hover:bg-[#356a91] transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {isSubmitting && (
                <Loader2 className="animate-spin" size={16} />
              )}
              {tab === 'login' ? '로그인' : '회원가입'}
            </button>

            <div className="flex items-center gap-3 pt-1">
              <span className="h-px flex-1 bg-gray-200" />
              <span className="text-xs text-gray-400">또는</span>
              <span className="h-px flex-1 bg-gray-200" />
            </div>

            <button
              type="button"
              onClick={() => handleOAuth('kakao')}
              className="w-full bg-[#FEE500] text-[#3C1E1E] py-2 rounded-lg font-semibold hover:brightness-95 transition"
            >
              카카오로 계속하기
            </button>
            <button
              type="button"
              onClick={() => handleOAuth('google')}
              className="w-full bg-white border border-gray-300 text-gray-700 py-2 rounded-lg font-semibold hover:bg-gray-50 transition"
            >
              Google로 계속하기
            </button>
          </form>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};

export default AuthModal;
