import React from 'react';
import { motion } from 'framer-motion';
import { ArrowUpCircle, X } from 'lucide-react';

// Figma V3-06 업데이트 — 설치 토스트(좌하단) · 강제 업데이트

// 호환성이 깨지는 패치일 때 앱 전체를 덮어 업데이트 외의 조작을 차단한다 (D-1).
export const ForceUpdateGate: React.FC<{
  latestVersion: string | null;
  busy?: boolean;
  onInstall: () => void;
}> = ({ latestVersion, busy, onInstall }) => (
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
        현재 버전은 더 이상 지원되지 않습니다. 업데이트해야 계속 사용할 수
        있으며, 다른 기능은 사용할 수 없습니다.
        {latestVersion && ` (최신 버전 ${latestVersion})`}
      </p>
      <button
        type="button"
        onClick={onInstall}
        disabled={busy}
        className="mt-6 h-[42px] w-full rounded-[10px] bg-[#5b8ce6] text-sm font-semibold text-white transition-colors hover:bg-[#4a7bd4] disabled:opacity-60"
      >
        {busy ? '업데이트 중...' : '지금 업데이트'}
      </button>
      <p className="mt-3 text-[12px] text-gray-400">
        설치가 시작되면 앱이 잠시 종료됐다가 다시 시작됩니다.
      </p>
    </motion.div>
  </div>
);

// 새 버전이 있으면 좌하단에 조용히 알린다 (D-2). 작업을 막지 않는다.
// 설치는 "지금 설치"를 눌렀을 때만 — 설치가 곧 앱 종료라서 마음대로 하면 안 된다.
/**
 * 새 버전 알림.
 *
 * 닫아도 사라지지 않고 **작은 칩으로 접힌다.** 예전에는 닫으면 그 세션에서 다시 뜰
 * 길이 없어, 작업 중에 무심코 닫으면 업데이트가 있다는 사실 자체를 알 수 없었다
 * (2026-09-01 요청). 접힌 칩은 로그인 화면·편집 화면 어디서나 같은 자리에 남는다.
 */
export const UpdateReadyToast: React.FC<{
  version: string | null;
  busy?: boolean;
  collapsed?: boolean;
  onInstall: () => void;
  onDismiss: () => void;
  onExpand?: () => void;
}> = ({ version, busy, collapsed, onInstall, onDismiss, onExpand }) =>
  collapsed ? (
    <motion.button
      type="button"
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      onClick={onExpand}
      title={`새 버전${version ? ` v${version}` : ''}이 준비되었습니다 — 눌러서 설치하기`}
      aria-label={`새 버전${version ? ` v${version}` : ''}이 준비되었습니다`}
      className="fixed bottom-6 left-6 z-[70] flex items-center gap-1.5 rounded-full border border-[#c8dbf6] bg-white px-3 py-1.5 text-[12px] font-semibold text-[#407FAC] shadow-lg transition-colors hover:bg-[#eef3fc]"
    >
      <ArrowUpCircle size={14} className="shrink-0" />
      업데이트
    </motion.button>
  ) : (
  <motion.div
    initial={{ opacity: 0, y: 12 }}
    animate={{ opacity: 1, y: 0 }}
    role="status"
    className="fixed bottom-6 left-6 z-[70] flex items-center gap-3 rounded-[12px] border border-gray-100 bg-white px-4 py-3 shadow-xl"
  >
    <ArrowUpCircle size={18} className="shrink-0 text-[#5b8ce6]" />
    <div className="text-[13px] text-gray-700">
      <p className="font-semibold">
        새 버전이 준비되었습니다{version ? ` (v${version})` : ''}
      </p>
      <p className="text-gray-400">
        지금 설치하면 앱이 잠시 종료됐다가 다시 시작됩니다.
      </p>
    </div>
    <button
      type="button"
      onClick={onInstall}
      disabled={busy}
      className="h-[30px] shrink-0 rounded-[8px] bg-[#5b8ce6] px-3 text-[12px] font-semibold text-white transition-colors hover:bg-[#4a7bd4] disabled:opacity-60"
    >
      {busy ? '설치 중...' : '지금 설치'}
    </button>
    <button
      type="button"
      onClick={onDismiss}
      aria-label="나중에"
      title="나중에"
      className="shrink-0 rounded p-1 text-gray-400 transition-colors hover:text-gray-600"
    >
      <X size={14} />
    </button>
  </motion.div>
  );
