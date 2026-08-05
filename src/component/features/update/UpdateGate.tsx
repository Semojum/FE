import React from 'react';
import { motion } from 'framer-motion';
import { ArrowUpCircle, X } from 'lucide-react';

// Figma V3-06 업데이트 — 설치 토스트(좌하단) · 강제 업데이트

// 호환성이 깨지는 패치일 때 앱 전체를 덮어 업데이트 외의 조작을 차단한다 (D-1).
export const ForceUpdateGate: React.FC<{
  latestVersion: string | null;
  onRelaunch: () => void;
}> = ({ latestVersion, onRelaunch }) => (
  <div className="fixed inset-0 z-[100] flex items-center justify-center bg-[#F0F4F8]/95 px-4">
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      role="alertdialog"
      aria-modal="true"
      className="w-full max-w-[420px] rounded-[14px] bg-white p-7 text-center shadow-xl"
    >
      <ArrowUpCircle size={40} className="mx-auto mb-4 text-[#5b8ce6]" />
      <h2 className="text-[16px] font-bold text-gray-800">
        최신 버전으로 업데이트가 필요합니다
      </h2>
      <p className="mt-2 text-[13px] leading-relaxed text-gray-500">
        이 버전은 더 이상 사용할 수 없습니다.
        {latestVersion && ` 최신 버전(${latestVersion})으로 업데이트한 뒤`}
        {latestVersion ? ' 이용해 주세요.' : ' 업데이트한 뒤 이용해 주세요.'}
      </p>
      <button
        type="button"
        onClick={onRelaunch}
        className="mt-6 h-[42px] w-full rounded-[10px] bg-[#5b8ce6] text-sm font-semibold text-white transition-colors hover:bg-[#4a7bd4]"
      >
        업데이트하고 다시 시작
      </button>
    </motion.div>
  </div>
);

// 설치가 준비되면 좌하단에 조용히 알린다 (D-2). 작업을 막지 않는다.
export const UpdateReadyToast: React.FC<{
  version: string | null;
  onRelaunch: () => void;
  onDismiss: () => void;
}> = ({ version, onRelaunch, onDismiss }) => (
  <motion.div
    initial={{ opacity: 0, y: 12 }}
    animate={{ opacity: 1, y: 0 }}
    role="status"
    className="fixed bottom-6 left-6 z-[70] flex items-center gap-3 rounded-[12px] border border-gray-100 bg-white px-4 py-3 shadow-xl"
  >
    <ArrowUpCircle size={18} className="shrink-0 text-[#5b8ce6]" />
    <div className="text-[13px] text-gray-700">
      <p className="font-semibold">
        새 버전{version ? ` ${version}` : ''} 설치 준비 완료
      </p>
      <p className="text-gray-400">다시 시작하면 적용됩니다.</p>
    </div>
    <button
      type="button"
      onClick={onRelaunch}
      className="h-[30px] shrink-0 rounded-[8px] bg-[#5b8ce6] px-3 text-[12px] font-semibold text-white transition-colors hover:bg-[#4a7bd4]"
    >
      다시 시작
    </button>
    <button
      type="button"
      onClick={onDismiss}
      aria-label="닫기"
      className="shrink-0 rounded p-1 text-gray-400 transition-colors hover:text-gray-600"
    >
      <X size={14} />
    </button>
  </motion.div>
);
