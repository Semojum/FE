import React from 'react';
import { FileText } from 'lucide-react';
import { FileCard, isInProgress } from '../../../types/mypage';
import { FavoriteStar, MODE_LABEL } from './DetailView';

// 마이페이지 첫 화면(S1) 위쪽 '최근 작업' 스트립 — 디자인 V3-04.
// 아래 목록은 지금 보고 있는 위치의 것이라, 폴더에 넣어 둔 최근 작업은 보이지 않는다.
// 그래서 위치를 가리지 않는 최근 작업 몇 건을 카드로 미리 걸어 둔다(GET /api/users/jobs/recent).
// 여러 건 선택·끌어 옮기기는 아래 목록의 몫이라 여기서는 열기·즐겨찾기·우클릭 메뉴만 받는다.

interface CardProps {
  file: FileCard;
  isPreviewed: boolean;
  onClick: () => void;
  onOpen: () => void;
  onToggleFavorite: () => void;
  onMenu: (x: number, y: number) => void;
}

const RecentCard: React.FC<CardProps> = ({
  file,
  isPreviewed,
  onClick,
  onOpen,
  onToggleFavorite,
  onMenu,
}) => {
  const meta = MODE_LABEL[file.mode] ?? { label: file.mode, color: '#9ebaee' };
  const busy = isInProgress(file.status);
  const failed = file.status === 'FAILED';

  // 날짜 자리에 상태를 대신 보여준다 — 변환 중이면 진행률, 실패면 빨간 '실패'.
  const statusLine = busy
    ? `변환 중${file.progress != null ? ` ${file.progress}%` : ''}`
    : failed
      ? '실패'
      : file.displayDate;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onDoubleClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === 'Enter') onOpen();
      }}
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onMenu(e.clientX, e.clientY);
      }}
      title={`${file.originalFileName} — 두 번 눌러 열기`}
      className={`group flex w-[169px] shrink-0 cursor-pointer flex-col overflow-hidden rounded-[10px] border bg-white shadow-sm transition-all hover:shadow ${
        isPreviewed
          ? 'border-[#5b8ce6] ring-2 ring-[#5b8ce6]/20'
          : 'border-gray-200 hover:border-[#5b8ce6]/40'
      }`}
    >
      {/* 썸네일 */}
      <div className="relative aspect-[169/94] w-full overflow-hidden bg-gray-100">
        {file.thumbnailUrl ? (
          <img
            src={file.thumbnailUrl}
            alt=""
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <FileText
              size={28}
              style={{ color: meta.color }}
              className="opacity-40"
            />
          </div>
        )}
        <div className="absolute right-1 top-1">
          <FavoriteStar
            isFavorite={file.isFavorite}
            onToggle={onToggleFavorite}
          />
        </div>
      </div>

      {/* 이름 · 상태 */}
      <div className="flex items-start gap-1.5 px-2.5 py-1.5">
        <FileText
          size={14}
          fill={meta.color}
          className="mt-0.5 shrink-0 text-white"
        />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[12px] font-medium text-gray-900">
            {file.originalFileName}
          </p>
          <p
            className={`truncate text-[11px] ${
              failed ? 'font-semibold text-[#ff3b30]' : 'text-[#929292]'
            }`}
          >
            {statusLine}
          </p>
        </div>
      </div>

      <div
        className="px-2 py-0.5 text-center text-[11px] font-semibold text-white"
        style={{ backgroundColor: meta.color }}
      >
        {meta.label}
      </div>
    </div>
  );
};

interface Props {
  files: FileCard[];
  previewId: string | null;
  onSeeAll: () => void;
  onClickFile: (file: FileCard) => void;
  onOpenFile: (file: FileCard) => void;
  onToggleFavorite: (file: FileCard) => void;
  onMenu: (file: FileCard, x: number, y: number) => void;
}

const RecentStrip: React.FC<Props> = ({
  files,
  previewId,
  onSeeAll,
  onClickFile,
  onOpenFile,
  onToggleFavorite,
  onMenu,
}) => (
  <section
    aria-label="최근 작업"
    // 스트립 안에서 우클릭·클릭이 아래 목록의 빈 곳 동작(새 폴더·선택 해제)으로
    // 새지 않게 여기서 끊는다.
    onClick={(e) => e.stopPropagation()}
    onContextMenu={(e) => {
      e.preventDefault();
      e.stopPropagation();
    }}
    className="mb-4 rounded-[12px] border border-gray-200 bg-[#f1f5fc] px-4 py-3"
  >
    <div className="mb-2.5 flex items-center justify-between">
      <h4 className="text-[13px] font-bold text-[#5b8ce6]">최근 작업</h4>
      <button
        type="button"
        onClick={onSeeAll}
        className="text-[12px] font-semibold text-[#f47726] transition-opacity hover:opacity-80"
      >
        전체 보기 ›
      </button>
    </div>
    {/* 카드 폭은 디자인(169px) 그대로 두고, 창이 좁으면 가로로 밀어 본다 */}
    <div className="custom-scrollbar flex gap-3 overflow-x-auto pb-1">
      {files.map((f) => (
        <RecentCard
          key={f.jobId}
          file={f}
          isPreviewed={previewId === f.jobId}
          onClick={() => onClickFile(f)}
          onOpen={() => onOpenFile(f)}
          onToggleFavorite={() => onToggleFavorite(f)}
          onMenu={(x, y) => onMenu(f, x, y)}
        />
      ))}
    </div>
  </section>
);

export default RecentStrip;
