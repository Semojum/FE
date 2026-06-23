import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Loader2, FileText } from 'lucide-react';
import { JobSummary, User } from '../../../types/auth';
import { listJobs } from '../../../api/HistoryService';
import { JobMode } from '../../../types/apiTypes';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  token: string;
  user?: User | null;
  onSelect: (job: JobSummary) => void;
}

// Figma "마이페이지" 카드 배지: 모드별 라벨 + 색상.
// a(이미지→텍스트)=초안 생성, b(텍스트→점자), c(이미지→점자).
const MODE_META: Record<JobMode, { label: string; color: string }> = {
  a: { label: '초안 생성', color: '#9ebaee' },
  b: { label: '텍스트 점자 번역', color: '#f3a890' },
  c: { label: '이미지 점자 번역', color: '#537fd0' },
};

const formatDate = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString('ko-KR');
};

const JobCard: React.FC<{ job: JobSummary; onSelect: () => void }> = ({
  job,
  onSelect,
}) => {
  const meta = MODE_META[job.mode] ?? { label: job.mode, color: '#9ebaee' };

  return (
    <li
      onClick={onSelect}
      className="group flex cursor-pointer flex-col overflow-hidden rounded-lg border border-[#b5b5b5]/60 bg-white shadow-[0px_2px_6px_rgba(0,0,0,0.1)] transition-all hover:-translate-y-0.5 hover:border-[#537fd0]/60 hover:shadow-md"
    >
      {/* 썸네일 */}
      <div className="aspect-[132/164] w-full overflow-hidden border-b border-[#b5b5b5]/40 bg-gray-100">
        {job.thumbnailUrl ? (
          <img
            src={job.thumbnailUrl}
            alt=""
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <FileText size={36} style={{ color: meta.color }} className="opacity-40" />
          </div>
        )}
      </div>

      {/* 파일 정보 */}
      <div className="flex items-start gap-1.5 px-2.5 py-2">
        <FileText
          size={16}
          fill={meta.color}
          className="mt-0.5 shrink-0 text-white"
        />
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-gray-900">
            {job.originalFileName}
          </p>
          <p className="mt-0.5 text-xs text-[#929292]">
            {formatDate(job.startedAt)}
          </p>
        </div>
      </div>

      {/* 모드 배지 */}
      <div
        className="px-2 py-1.5 text-center text-xs font-semibold text-white"
        style={{ backgroundColor: meta.color }}
      >
        {meta.label}
      </div>
    </li>
  );
};

const MyPageModal: React.FC<Props> = ({
  isOpen,
  onClose,
  token,
  user,
  onSelect,
}) => {
  const [jobs, setJobs] = useState<JobSummary[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    setIsLoading(true);
    setError(null);
    listJobs(token)
      .then((list) => {
        if (!cancelled) setJobs(list);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(
          err instanceof Error ? err.message : '작업 목록 불러오기 실패',
        );
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isOpen, token]);

  if (!isOpen) return null;

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
          initial={{ opacity: 0, scale: 0.97, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.97, y: 10 }}
          className="relative flex max-h-[88vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-gray-100 bg-[#f8f9fa] shadow-xl"
        >
          {/* 헤더 — Figma "마이페이지" 탭 */}
          <div className="flex items-end justify-between px-6 pt-5">
            <h3 className="border-b-2 border-[#5b8ce6] pb-2 text-lg font-bold tracking-[0.18px] text-[#5b8ce6]">
              마이페이지
            </h3>
            <div className="flex items-center gap-3 pb-2">
              {user?.name && (
                <span className="hidden text-sm text-gray-500 sm:inline">
                  {user.name}
                </span>
              )}
              <button
                onClick={onClose}
                className="rounded-full p-1 transition-colors hover:bg-gray-200/70"
                aria-label="닫기"
              >
                <X size={18} className="text-gray-500" />
              </button>
            </div>
          </div>
          <div className="mx-6 border-b border-gray-200" />

          {/* 본문 — 작업 카드 그리드 */}
          <div className="custom-scrollbar flex-1 overflow-y-auto p-6">
            {isLoading ? (
              <div className="flex flex-col items-center justify-center gap-2 py-24 text-gray-400">
                <Loader2 className="animate-spin" size={32} />
                <p>불러오는 중...</p>
              </div>
            ) : error ? (
              <div className="py-24 text-center text-red-500">{error}</div>
            ) : jobs.length === 0 ? (
              <div className="py-24 text-center text-gray-400">
                <FileText size={48} className="mx-auto mb-4 opacity-30" />
                <p>저장된 작업이 없습니다.</p>
              </div>
            ) : (
              <ul className="grid grid-cols-2 gap-5 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
                {jobs.map((job) => (
                  <JobCard
                    key={job.jobId}
                    job={job}
                    onSelect={() => onSelect(job)}
                  />
                ))}
              </ul>
            )}
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};

export default MyPageModal;
