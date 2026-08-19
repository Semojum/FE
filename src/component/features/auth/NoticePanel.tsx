import React, { useEffect, useState } from 'react';
import { ChevronDown, Megaphone } from 'lucide-react';
import { listPublicNotices } from '../../../api/NoticeService';
import { PublicNotice } from '../../../types/org';

// 로그인 화면 옆 공지 패널.
//
// 공지 본문은 목록 응답에 함께 오므로 제목을 누르면 그 자리에서 펼친다 —
// 로그인 전 화면에서 새 창이나 추가 조회로 흐름을 끊지 않는다.
//
// 공개 공지 API가 아직 없어(2026-08-19) 서버가 열어 주기 전까지 이 패널은
// 아무것도 그리지 않는다. 로그인 화면이 빈 상자나 오류 문구로 어수선해지면
// 정작 중요한 아이디·비밀번호 칸이 묻힌다.

const dateLabel = (n: PublicNotice): string => {
  const raw = n.createdAt ?? n.startsOn;
  if (!raw) return '';
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return raw.slice(5, 10);
  return `${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate(),
  ).padStart(2, '0')}`;
};

const NoticePanel: React.FC = () => {
  const [notices, setNotices] = useState<PublicNotice[] | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    let alive = true;
    void listPublicNotices(controller.signal).then((list) => {
      if (alive) setNotices(list);
    });
    return () => {
      alive = false;
      controller.abort();
    };
  }, []);

  // 못 불러왔거나(미배포) 노출 중인 공지가 없으면 패널 자체를 띄우지 않는다.
  if (!notices || notices.length === 0) return null;

  return (
    <aside
      aria-labelledby="notice-panel-title"
      className="w-full max-w-[366px] rounded-[14px] border border-[#dfe8f2] bg-white p-5 shadow-[0_2px_10px_0_rgba(23,43,77,0.07)] lg:w-[360px]"
    >
      <h2
        id="notice-panel-title"
        className="flex items-center gap-2 text-[15px] font-bold text-gray-700"
      >
        <Megaphone size={16} className="text-[#5b8ce6]" aria-hidden />
        공지
      </h2>

      <ul className="mt-3 flex flex-col divide-y divide-[#f1f5f9]">
        {notices.map((n) => {
          const isOpen = openId === n.id;
          return (
            <li key={n.id} className="py-1">
              <button
                type="button"
                onClick={() => setOpenId(isOpen ? null : n.id)}
                aria-expanded={isOpen}
                className="flex w-full items-center gap-2 rounded-[8px] px-1 py-2 text-left transition-colors hover:bg-[#f0f4f8]"
              >
                <span className="shrink-0 text-[11.5px] text-gray-400">
                  {dateLabel(n)}
                </span>
                <span className="flex-1 truncate text-[13px] font-medium text-gray-700">
                  {n.title}
                </span>
                <ChevronDown
                  size={15}
                  aria-hidden
                  className={`shrink-0 text-gray-400 transition-transform ${
                    isOpen ? 'rotate-180' : ''
                  }`}
                />
              </button>
              {isOpen && (
                <p className="whitespace-pre-wrap px-1 pb-3 text-[12.5px] leading-relaxed text-gray-600">
                  {n.body}
                </p>
              )}
            </li>
          );
        })}
      </ul>
    </aside>
  );
};

export default NoticePanel;
