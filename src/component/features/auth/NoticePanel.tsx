import React, { useEffect, useState } from 'react';
import { ChevronDown, Megaphone } from 'lucide-react';
import { listPublicNotices } from '../../../api/NoticeService';
import { PublicNotice } from '../../../types/org';

// 로그인 화면 오른쪽 가장자리에 걸린 공지 책갈피.
//
// 화면 오른쪽 끝에 붙여 두고 배경을 본문과 다르게 깔아, 로그인 칸과 한 덩어리로
// 보이지 않게 한다(아래 V자 노치가 책갈피 끝이다). 로그인 칸은 이 띠를 뺀
// 왼쪽 공간의 한가운데에 놓인다 — 공지가 없으면 띠가 통째로 빠져 화면 전체 중앙이 된다.
//
// 공지 본문은 목록 응답에 함께 오므로 제목을 누르면 그 자리에서 펼친다 —
// 로그인 전 화면에서 새 창이나 추가 조회로 흐름을 끊지 않는다.
//
// 못 불러오거나 노출 중인 공지가 없으면 아무것도 그리지 않는다. 로그인 화면이
// 빈 상자나 오류 문구로 어수선해지면 정작 중요한 아이디·비밀번호 칸이 묻힌다.

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
      // 책갈피 — 오른쪽 끝에 붙고, 왼쪽 모서리만 둥글며, 아래 끝이 V자로 파인다.
      className="relative flex h-full w-[300px] shrink-0 flex-col rounded-l-[20px] border-l border-[#bcd0ee] bg-gradient-to-b from-[#dbe7f9] to-[#c9dbf3] shadow-[-12px_0_30px_0_rgba(23,43,77,0.14)] [clip-path:polygon(0_0,100%_0,100%_100%,50%_calc(100%-36px),0_100%)] xl:w-[340px]"
    >
      <h2
        id="notice-panel-title"
        className="flex shrink-0 items-center gap-2 border-b border-[#aec6e9] px-5 pb-3 pt-6 text-[15px] font-bold text-[#2f4f7f]"
      >
        <Megaphone size={16} className="text-[#3a6cc0]" aria-hidden />
        공지
      </h2>

      <ul className="custom-scrollbar flex flex-1 flex-col gap-1.5 divide-y-0 overflow-y-auto px-4 pb-14 pt-2">
        {notices.map((n) => {
          const isOpen = openId === n.id;
          return (
            <li key={n.id}>
              <button
                type="button"
                onClick={() => setOpenId(isOpen ? null : n.id)}
                aria-expanded={isOpen}
                className="flex w-full items-center gap-2 rounded-[10px] bg-white/80 px-3 py-2.5 text-left shadow-[0_1px_3px_0_rgba(23,43,77,0.06)] transition-colors hover:bg-white"
              >
                <span className="shrink-0 text-[11.5px] text-gray-500">
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
                <p className="mt-1 whitespace-pre-wrap rounded-[10px] bg-white/60 px-3 py-2.5 text-[12.5px] leading-relaxed text-gray-600">
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
