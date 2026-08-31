import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Loader2, Eye, EyeOff } from 'lucide-react';
import { ApiError } from '../../../api/apiClient';
import type { SessionEndedReason } from '../../../hooks/UseAuth';
import { readLastLoginId } from '../../../utils/lastLoginId';
import NoticePanel from './NoticePanel';
import DevModeLayer from '../dev/DevModeLayer';

// Figma V3-01 로그인 / V3-01 로그인 — 오류(AUTH4001) / V3-01 중복 로그인 안내.
// V3에서 회원가입·소셜 로그인이 제거되어 화면은 아이디·비밀번호·로그인 버튼뿐이다.

interface Props {
  onLogin: (loginId: string, password: string) => Promise<void>;
  // 직전 세션이 끊긴 사유 — 있으면 안내 모달을 먼저 띄운다.
  sessionEndedReason?: SessionEndedReason | null;
  onAcknowledgeSessionEnded?: () => void;
}

// 입력 칸은 각지게 둔다(둥근 모서리 없음 — 사용자 요청 2026-08-20).
const inputCls =
  'h-[42px] w-full border border-gray-200 bg-white px-4 text-sm text-gray-700 placeholder:text-[#adadad] shadow-sm transition-colors focus:border-[#5b8ce6] focus:outline-none';

// 서버 코드별 로그인 화면 문구. 코드가 없거나 모르는 코드면 서버 message를 그대로 쓴다.
const errorMessage = (err: unknown): string => {
  if (err instanceof ApiError) {
    switch (err.code) {
      case 'AUTH4001':
        return '아이디 또는 비밀번호가 올바르지 않습니다';
      case 'AUTH4004':
        return '비활성화된 계정입니다. 기관 담당자에게 문의해 주세요';
      case 'COMMON4000':
        return '아이디와 비밀번호를 입력해 주세요';
      default:
        return err.message;
    }
  }
  return err instanceof Error ? err.message : '오류가 발생했습니다.';
};

const LoginScreen: React.FC<Props> = ({
  onLogin,
  sessionEndedReason,
  onAcknowledgeSessionEnded,
}) => {
  // 지난번에 쓴 아이디를 미리 채워 둔다. 비밀번호는 저장하지 않으므로(자동 로그인 없음)
  // 아이디가 채워져 있으면 커서는 비밀번호 칸에서 시작한다.
  const [savedId] = useState(readLastLoginId);
  const [loginId, setLoginId] = useState(savedId);
  const [password, setPassword] = useState('');
  const hasSavedId = savedId.length > 0;
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      await onLogin(loginId.trim(), password);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-hidden bg-[#F0F4F8]">
      {/* 공지는 오른쪽 끝에 책갈피로 걸리고, 로그인 칸은 그 왼쪽 "남은 공간"의
          한가운데에 놓인다. 공지가 없으면 책갈피가 통째로 빠져 화면 전체 중앙이 된다. */}
      <div className="flex h-full w-full">
        <form
          onSubmit={handleSubmit}
          className="flex h-full flex-1 items-center justify-center overflow-y-auto px-4 py-12"
        >
          {/* 입력 칸 폭은 그대로 두고, 남은 공간 안에서 가운데로만 옮긴다. */}
          <div className="flex w-full max-w-[366px] flex-col items-center">
            <img
              src="semojum-symbol.png"
              alt="세모점"
              className="w-[120px] h-[120px] object-contain mb-14 select-none"
            />

            <div className="flex w-full flex-col gap-3">
              <input
                type="text"
                placeholder="아이디"
                value={loginId}
                onChange={(e) => setLoginId(e.target.value)}
                required
                autoFocus={!hasSavedId}
                autoComplete="username"
                className={inputCls}
              />

              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  placeholder="비밀번호"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoFocus={hasSavedId}
                  autoComplete="current-password"
                  className={`${inputCls} pr-12`}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={
                    showPassword ? '비밀번호 숨기기' : '비밀번호 표시'
                  }
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 transition-colors hover:text-[#5b8ce6]"
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>

              {error && (
                <p role="alert" className="px-1 text-[13px] text-[#ff3b30]">
                  {error}
                </p>
              )}

              <button
                type="submit"
                disabled={isSubmitting}
                className="mt-1 flex h-[42px] items-center justify-center gap-2 bg-[#5b8ce6] text-sm font-semibold text-white transition-colors hover:bg-[#4a7bd4] disabled:opacity-50"
              >
                {isSubmitting && <Loader2 className="animate-spin" size={16} />}
                로그인
              </button>
            </div>
          </div>
        </form>

        <NoticePanel />
      </div>

      <DevModeLayer />

      {/* 중복 로그인으로 밀려난 세션 안내 — 확인을 누르면 이 로그인 화면으로 돌아온다. */}
      {sessionEndedReason && (
        <div className="fixed inset-0 z-10 flex items-center justify-center bg-black/30 px-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            role="alertdialog"
            aria-labelledby="session-ended-title"
            className="w-full max-w-[400px] rounded-[14px] bg-white p-6 shadow-xl"
          >
            <h2
              id="session-ended-title"
              className="text-[15px] font-bold text-gray-800"
            >
              {sessionEndedReason === 'evicted'
                ? '다른 기기에서 로그인되었습니다'
                : '세션이 만료되었습니다'}
            </h2>
            <p className="mt-2 text-[13px] text-gray-500">
              {sessionEndedReason === 'evicted'
                ? '새 로그인으로 이 세션이 종료되어 로그인 화면으로 이동합니다.'
                : '로그인 후 다시 이용해 주세요.'}
            </p>
            <div className="mt-5 flex justify-end">
              <button
                type="button"
                autoFocus
                onClick={onAcknowledgeSessionEnded}
                className="h-[38px] rounded-[10px] bg-[#5b8ce6] px-6 text-sm font-semibold text-white transition-colors hover:bg-[#4a7bd4]"
              >
                확인
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
};

export default LoginScreen;
