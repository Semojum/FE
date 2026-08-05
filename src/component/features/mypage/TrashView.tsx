import React, { useCallback, useEffect, useState } from 'react';
import { ChevronLeft, FileText, Folder, Loader2 } from 'lucide-react';
import {
  listTrash,
  purgeTrashItem,
  restoreTrashItem,
} from '../../../api/TrashService';
import { toUserMessage } from '../../../api/errorMessages';
import { TrashItem } from '../../../types/mypage';

// Figma V3-05 휴지통(S8) — 줄 목록으로 이름 · 삭제일 · D-day · 복원 · 완전 삭제.
// 30일이 지나면 스케줄러가 DB·S3까지 완전히 지운다.

interface Props {
  token: string;
  onBack: () => void;
  onError: (message: string) => void;
  // 복원하면 목록 화면의 내용이 바뀌므로 알린다.
  onChanged: () => void;
}

const formatDeletedAt = (iso: string) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return `${d.getMonth() + 1}. ${d.getDate()}. 삭제`;
};

// 완전 삭제까지 남은 일수. 만료가 지났으면 D-0으로 표시한다.
const dDay = (expiresAt: string) => {
  const ms = new Date(expiresAt).getTime() - Date.now();
  if (Number.isNaN(ms)) return null;
  return Math.max(0, Math.ceil(ms / 86_400_000));
};

const TrashView: React.FC<Props> = ({ token, onBack, onError, onChanged }) => {
  const [items, setItems] = useState<TrashItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  // 처리 중인 항목 id — 버튼 중복 클릭을 막는다.
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await listTrash(token);
      setItems(res.items ?? []);
    } catch (err) {
      onError(toUserMessage(err, '휴지통을 불러오지 못했습니다.'));
    } finally {
      setIsLoading(false);
    }
  }, [token, onError]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleRestore = async (item: TrashItem) => {
    setBusyId(item.id);
    try {
      await restoreTrashItem(item.id, token);
      setItems((prev) => prev.filter((i) => i.id !== item.id));
      onChanged();
    } catch (err) {
      onError(toUserMessage(err, '복원하지 못했습니다.'));
    } finally {
      setBusyId(null);
    }
  };

  const handlePurge = async (item: TrashItem) => {
    // 복구할 수 없는 동작이므로 한 번 더 확인받는다.
    const ok = window.confirm(
      `"${item.name}"을(를) 완전히 삭제합니다.\n삭제한 뒤에는 복구할 수 없습니다.`,
    );
    if (!ok) return;
    setBusyId(item.id);
    try {
      await purgeTrashItem(item.id, token);
      setItems((prev) => prev.filter((i) => i.id !== item.id));
    } catch (err) {
      onError(toUserMessage(err, '완전 삭제하지 못했습니다.'));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="px-6 py-5">
      <div className="mb-5 flex items-center gap-3">
        <button
          type="button"
          onClick={onBack}
          aria-label="뒤로"
          className="flex size-8 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-500 transition-colors hover:text-[#5b8ce6]"
        >
          <ChevronLeft size={16} />
        </button>
        <h3 className="text-[15px] font-bold text-gray-800">휴지통</h3>
        <span className="text-[12px] text-gray-400">
          · 30일이 지나면 자동으로 삭제됩니다
        </span>
      </div>

      {isLoading ? (
        <div className="flex flex-col items-center gap-2 py-24 text-gray-400">
          <Loader2 className="animate-spin" size={28} />
          <p className="text-sm">불러오는 중...</p>
        </div>
      ) : items.length === 0 ? (
        <p className="py-24 text-center text-sm text-gray-400">
          휴지통이 비어 있습니다
        </p>
      ) : (
        <ul>
          {items.map((item) => {
            const days = dDay(item.expiresAt);
            const busy = busyId === item.id;
            return (
              <li
                key={item.id}
                className="flex items-center gap-3 border-b border-gray-100 py-3"
              >
                {item.type === 'FOLDER' ? (
                  <Folder size={17} className="shrink-0 text-gray-400" />
                ) : (
                  <FileText size={17} className="shrink-0 text-[#9ebaee]" />
                )}
                <span className="min-w-0 flex-1 truncate text-sm font-semibold text-gray-800">
                  {item.name}
                  {item.type === 'FOLDER' && item.itemCount != null && (
                    <span className="ml-2 text-[12px] font-normal text-gray-400">
                      작업 {item.itemCount}개 포함
                    </span>
                  )}
                </span>
                <span className="shrink-0 text-[12px] text-gray-400">
                  {formatDeletedAt(item.deletedAt)}
                </span>
                {days != null && (
                  <span className="shrink-0 text-[12px] font-bold text-[#f47726]">
                    D-{days}
                  </span>
                )}
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void handleRestore(item)}
                  className="h-[30px] shrink-0 rounded-[8px] bg-[#5b8ce6] px-4 text-[13px] font-semibold text-white transition-colors hover:bg-[#4a7bd4] disabled:opacity-50"
                >
                  복원
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void handlePurge(item)}
                  className="h-[30px] shrink-0 rounded-[8px] border border-gray-200 bg-white px-4 text-[13px] font-semibold text-gray-600 transition-colors hover:border-red-200 hover:text-red-500 disabled:opacity-50"
                >
                  삭제
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
};

export default TrashView;
