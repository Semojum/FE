import React from 'react';
import { FileText, Folder, MoreHorizontal, Star } from 'lucide-react';
import { FileCard, FolderSummary, isInProgress } from '../../../types/mypage';
import { JobMode } from '../../../types/apiTypes';

// Figma V3/FileCard · V3/FolderCard · V3/FavoriteStar

// 카드 하단 모드 배지 — a(이미지→텍스트)=초안 생성, b(텍스트→점자), c(이미지→점자)
const MODE_META: Record<JobMode, { label: string; color: string }> = {
  a: { label: '초안 생성', color: '#9ebaee' },
  b: { label: '텍스트 점자 번역', color: '#537fd0' },
  c: { label: '이미지 점자 번역', color: '#f3a890' },
};

const FavoriteStar: React.FC<{
  isFavorite: boolean;
  onToggle: () => void;
}> = ({ isFavorite, onToggle }) => (
  <button
    type="button"
    onClick={(e) => {
      e.stopPropagation();
      onToggle();
    }}
    aria-label={isFavorite ? '즐겨찾기 해제' : '즐겨찾기'}
    aria-pressed={isFavorite}
    className="rounded p-0.5 text-gray-300 transition-colors hover:text-[#f5b942]"
  >
    <Star
      size={15}
      className={isFavorite ? 'text-[#f5b942]' : ''}
      fill={isFavorite ? '#f5b942' : 'none'}
    />
  </button>
);

// ⋯ 버튼은 hover 전에는 보이지 않는다. 자리를 차지하면 카드 안의 이름이
// 불필요하게 잘리므로 레이아웃에서 빼고 절대 위치로 겹쳐 놓는다.
const MoreButton: React.FC<{
  onOpen: (x: number, y: number) => void;
  className?: string;
}> = ({ onOpen, className = '' }) => (
  <button
    type="button"
    aria-label="메뉴 열기"
    onClick={(e) => {
      e.stopPropagation();
      const r = e.currentTarget.getBoundingClientRect();
      onOpen(r.left, r.bottom);
    }}
    className={`absolute rounded bg-white/90 p-0.5 text-gray-400 opacity-0 transition-opacity hover:text-gray-700 group-hover:opacity-100 ${className}`}
  >
    <MoreHorizontal size={16} />
  </button>
);

// ─── 폴더 카드 ───────────────────────────────────────────────────────

interface FolderCardProps {
  folder: FolderSummary;
  onOpen: () => void;
  onToggleFavorite: () => void;
  onMenu: (x: number, y: number) => void;
}

export const FolderCardItem: React.FC<FolderCardProps> = ({
  folder,
  onOpen,
  onToggleFavorite,
  onMenu,
}) => (
  <div
    role="button"
    tabIndex={0}
    onDoubleClick={onOpen}
    onKeyDown={(e) => {
      if (e.key === 'Enter') onOpen();
    }}
    onContextMenu={(e) => {
      e.preventDefault();
      onMenu(e.clientX, e.clientY);
    }}
    className="group relative flex h-[44px] w-[172px] cursor-pointer items-center gap-2 rounded-[10px] border border-gray-200 bg-white px-3 shadow-sm transition-all hover:border-[#5b8ce6]/50 hover:shadow"
    title={`${folder.name} — 두 번 클릭해 열기`}
  >
    <Folder size={16} className="shrink-0 text-gray-500" />
    <span className="min-w-0 flex-1 truncate text-sm font-medium text-gray-800">
      {folder.name}
    </span>
    <FavoriteStar isFavorite={folder.isFavorite} onToggle={onToggleFavorite} />
    <MoreButton onOpen={onMenu} className="right-1 top-1" />
  </div>
);

// ─── 파일 카드 ───────────────────────────────────────────────────────

interface FileCardProps {
  file: FileCard;
  isSelected: boolean;
  // 위치를 함께 보여줄지 (S9 최근 작업 전체 · S7 검색 결과)
  showLocation?: boolean;
  onClick: (e: React.MouseEvent) => void;
  onOpen: () => void;
  onToggleFavorite: () => void;
  onMenu: (x: number, y: number) => void;
}

export const FileCardItem: React.FC<FileCardProps> = ({
  file,
  isSelected,
  showLocation,
  onClick,
  onOpen,
  onToggleFavorite,
  onMenu,
}) => {
  const meta = MODE_META[file.mode] ?? { label: file.mode, color: '#9ebaee' };
  const busy = isInProgress(file.status);
  const failed = file.status === 'FAILED';

  // 날짜 자리에 상태를 대신 보여준다 — 생성 중이면 진행률, 실패면 빨간 "실패".
  const statusLine = busy
    ? file.progress != null
      ? `변환 중 ${file.progress}%`
      : '변환 중'
    : failed
      ? '실패'
      : file.displayDate;

  return (
    <div
      role="button"
      tabIndex={0}
      aria-pressed={isSelected}
      onClick={onClick}
      onDoubleClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === 'Enter') onOpen();
      }}
      onContextMenu={(e) => {
        e.preventDefault();
        onMenu(e.clientX, e.clientY);
      }}
      className={`group flex w-[169px] cursor-pointer flex-col overflow-hidden rounded-[10px] border bg-white shadow-sm transition-all hover:shadow ${
        isSelected
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
        <div className="absolute right-1.5 top-1.5">
          <FavoriteStar
            isFavorite={file.isFavorite}
            onToggle={onToggleFavorite}
          />
        </div>
      </div>

      {/* 이름 · 상태 */}
      <div className="relative flex items-start gap-1.5 px-2.5 py-2">
        <FileText
          size={15}
          fill={meta.color}
          className="mt-0.5 shrink-0 text-white"
        />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-medium text-gray-900">
            {file.originalFileName}
          </p>
          <p
            className={`mt-0.5 truncate text-[11px] ${
              failed ? 'font-semibold text-[#ff3b30]' : 'text-[#929292]'
            }`}
          >
            {statusLine}
          </p>
          {showLocation && (
            <p className="mt-0.5 truncate text-[11px] text-gray-400">
              {file.folderPath ?? '전체'}
            </p>
          )}
        </div>
        <MoreButton onOpen={onMenu} className="right-1 top-1.5" />
      </div>

      <div
        className="px-2 py-1 text-center text-[11px] font-semibold text-white"
        style={{ backgroundColor: meta.color }}
      >
        {meta.label}
      </div>
    </div>
  );
};
