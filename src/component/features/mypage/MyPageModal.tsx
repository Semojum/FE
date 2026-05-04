import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Trash2, Loader2, FileText, Calendar } from 'lucide-react';
import { JobSummary } from '../../../types/auth';
import { listJobs, deleteJob } from '../../../api/HistoryService';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  token: string;
  onSelect: (jobId: string) => void;
}

const MyPageModal: React.FC<Props> = ({
  isOpen,
  onClose,
  token,
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

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('이 작업을 삭제할까요?')) return;
    try {
      await deleteJob(token, id);
      setJobs((prev) => prev.filter((j) => j.id !== id));
    } catch {
      alert('삭제에 실패했습니다.');
    }
  };

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
          initial={{ opacity: 0, scale: 0.95, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 10 }}
          className="relative bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[80vh] overflow-hidden border border-gray-100 flex flex-col"
        >
          <div className="flex justify-between items-center p-4 border-b border-gray-100">
            <h3 className="font-bold text-lg text-gray-800">
              마이페이지 — 이전 작업
            </h3>
            <button
              onClick={onClose}
              className="p-1 hover:bg-gray-100 rounded-full transition-colors"
              aria-label="닫기"
            >
              <X size={18} className="text-gray-500" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
            {isLoading ? (
              <div className="flex flex-col items-center justify-center py-20 text-gray-400 gap-2">
                <Loader2 className="animate-spin" size={32} />
                <p>불러오는 중...</p>
              </div>
            ) : error ? (
              <div className="text-center py-20 text-red-500">{error}</div>
            ) : jobs.length === 0 ? (
              <div className="text-center py-20 text-gray-400">
                <FileText size={48} className="mx-auto mb-4 opacity-30" />
                <p>저장된 작업이 없습니다.</p>
              </div>
            ) : (
              <ul className="space-y-2">
                {jobs.map((job) => (
                  <li
                    key={job.id}
                    onClick={() => onSelect(job.id)}
                    className="group flex items-center gap-4 p-4 bg-white border border-gray-100 rounded-xl hover:border-[#407FAC]/40 hover:shadow-sm cursor-pointer transition-all"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-gray-800 truncate">
                        {job.title}
                      </p>
                      <div className="flex items-center gap-2 text-xs text-gray-400 mt-1">
                        <span className="font-medium text-[#407FAC]">
                          {job.mode}
                        </span>
                        <span>·</span>
                        <span className="truncate">{job.fileName}</span>
                        <span>·</span>
                        <span className="flex items-center gap-1 whitespace-nowrap">
                          <Calendar size={12} />
                          {new Date(job.createdAt).toLocaleString('ko-KR')}
                        </span>
                      </div>
                    </div>
                    <button
                      onClick={(e) => handleDelete(job.id, e)}
                      className="p-2 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors opacity-0 group-hover:opacity-100"
                      title="삭제"
                      aria-label="작업 삭제"
                    >
                      <Trash2 size={16} />
                    </button>
                  </li>
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
