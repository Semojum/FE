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
// 공지가 없어도 패널은 그대로 둔다(2026-09-01 요청). 있을 때만 나타나면 화면 폭이
// 그때그때 달라져 로그인 칸이 옆으로 밀리고, "공지가 없는 것"과 "공지 자리가 아예
// 없는 것"을 사용자가 가릴 수 없다 — 운영자가 공지를 올렸는데 안 보이는지, 원래
// 안 뜨는 화면인지 묻게 된다. 대신 빈 상태를 한 줄로 적어 둔다.

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
  // 불러오는 중과 "불러왔는데 없음"을 가른다 — 둘 다 빈 목록이라 문구가 달라야 한다.
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    let alive = true;
    void listPublicNotices(controller.signal).then((list) => {
      if (!alive) return;
      setNotices(list);
      setLoading(false);
    });
    return () => {
      alive = false;
      controller.abort();
    };
  }, []);

  const items = notices ?? [];
  // 빈 자리에 적을 한 줄. 못 불러온 것과 없는 것을 가려서 적는다 —
  // "불러오지 못했습니다"는 다시 열어 보면 될 수도 있다는 뜻이다.
  const emptyLabel = loading
    ? '공지를 불러오는 중입니다.'
    : notices === null
      ? '공지를 불러오지 못했습니다.'
      : '등록된 공지가 없습니다.';

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

      {items.length === 0 && (
        <p className="px-5 pt-4 text-[12.5px] leading-relaxed text-[#5c7aa8]">
          {emptyLabel}
        </p>
      )}

      <ul className="custom-scrollbar flex flex-1 flex-col gap-1.5 divide-y-0 overflow-y-auto px-4 pb-14 pt-2">
        {items.map((n) => {
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
