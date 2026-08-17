import React from 'react';
import { Folder, FileText, Star, Download, ExternalLink } from 'lucide-react';
import { FileCard, FolderSummary, isInProgress } from '../../../types/mypage';
import { JobMode } from '../../../types/apiTypes';

// 윈도우 파일 탐색기의 "자세히 보기" 형태 목록 + 오른쪽 미리보기.
// 왼쪽은 이름 · 모드 · 작성일 세 칸이고, 줄을 누르면 오른쪽에 미리보기가 뜬다.
// (카드 격자를 대신한다 — 한 화면에 더 많이 보이고 정렬 기준이 눈에 보인다)

export const MODE_LABEL: Record<JobMode, { label: string; color: string }> = {
  a: { label: '초안 생성', color: '#9ebaee' },
  b: { label: '텍스트 점자 번역', color: '#537fd0' },
  c: { label: '이미지 점자 번역', color: '#f3a890' },
};

// 폴더는 작성일만 있고 서버가 만들어 준 표시용 문자열이 없다.
const shortDate = (iso: string): string => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? ''
    : `${d.getFullYear()}. ${d.getMonth() + 1}. ${d.getDate()}.`;
};

export const FavoriteStar: React.FC<{
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
    className="rounded p-0.5 text-gray-300 opacity-0 transition-colors group-hover:opacity-100 hover:text-[#f5b942] aria-pressed:opacity-100"
  >
    <Star
      size={14}
      className={isFavorite ? 'text-[#f5b942]' : ''}
      fill={isFavorite ? '#f5b942' : 'none'}
    />
  </button>
);

const COL = {
  name: 'flex min-w-0 flex-1 items-center gap-2',
  mode: 'w-[140px] shrink-0 text-[12px]',
  date: 'w-[110px] shrink-0 text-[12px] text-gray-500',
};

interface Props {
  folders: FolderSummary[];
  files: FileCard[];
  // 여러 건 선택(파일만) — 툴바의 이동·삭제 대상
  selectedIds: Set<string>;
  // 미리보기에 띄운 한 건
  previewId: string | null;
  showLocation?: boolean;
  dropFolderId: string | null;

  onOpenFolder: (folder: FolderSummary) => void;
  onOpenFile: (file: FileCard) => void;
  onClickFile: (file: FileCard, e: React.MouseEvent) => void;
  onClickFolder: (folder: FolderSummary) => void;
  onToggleFolderFavorite: (folder: FolderSummary) => void;
  onToggleFileFavorite: (file: FileCard) => void;
  onFolderMenu: (folder: FolderSummary, x: number, y: number) => void;
  onFileMenu: (file: FileCard, x: number, y: number) => void;

  onDragStartFolder: (folder: FolderSummary) => void;
  onDragStartFile: (file: FileCard) => void;
  onDragEnd: () => void;
  onDragEnterFolder: (folderId: string) => void;
  onDragLeaveFolder: (folderId: string) => void;
  onDropOnFolder: (folderId: string) => void;
}

export const DetailList: React.FC<Props> = ({
  folders,
  files,
  selectedIds,
  previewId,
  showLocation,
  dropFolderId,
  onOpenFolder,
  onOpenFile,
  onClickFile,
  onClickFolder,
  onToggleFolderFavorite,
  onToggleFileFavorite,
  onFolderMenu,
  onFileMenu,
  onDragStartFolder,
  onDragStartFile,
  onDragEnd,
  onDragEnterFolder,
  onDragLeaveFolder,
  onDropOnFolder,
}) => (
  <div role="table" aria-label="파일 목록" className="min-w-[420px]">
    {/* 열 제목 */}
    <div
      role="row"
      className="sticky top-0 z-10 flex items-center gap-3 border-b border-gray-200 bg-[#f8f9fa] px-3 py-1.5 text-[11px] font-semibold text-gray-500"
    >
      <span role="columnheader" className={COL.name}>
        이름
      </span>
      <span role="columnheader" className={COL.mode}>
        모드
      </span>
      <span role="columnheader" className={COL.date}>
        작성일
      </span>
    </div>

    {/* 폴더가 항상 파일보다 앞에 온다 */}
    {folders.map((f) => (
      <div
        key={f.folderId}
        role="row"
        tabIndex={0}
        draggable
        onDragStart={(e) => {
          e.dataTransfer.setData('text/plain', f.name);
          e.dataTransfer.effectAllowed = 'move';
          onDragStartFolder(f);
        }}
        onDragEnd={onDragEnd}
        onDragOver={(e) => e.preventDefault()}
        onDragEnter={() => onDragEnterFolder(f.folderId)}
        onDragLeave={() => onDragLeaveFolder(f.folderId)}
        onDrop={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onDropOnFolder(f.folderId);
        }}
        onClick={() => onClickFolder(f)}
        onDoubleClick={() => onOpenFolder(f)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') onOpenFolder(f);
        }}
        onContextMenu={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onFolderMenu(f, e.clientX, e.clientY);
        }}
        title={`${f.name} — 두 번 눌러 열기`}
        className={`group flex cursor-pointer items-center gap-3 border-b border-gray-100 px-3 py-1.5 text-[13px] transition-colors ${
          dropFolderId === f.folderId
            ? 'bg-[#eef3fc] ring-1 ring-inset ring-[#5b8ce6]'
            : 'hover:bg-[#f3f6fb]'
        }`}
      >
        <span role="cell" className={COL.name}>
          <Folder size={15} className="shrink-0 text-[#5b8ce6]" />
          <span className="truncate font-medium text-gray-800">{f.name}</span>
          <FavoriteStar
            isFavorite={f.isFavorite}
            onToggle={() => onToggleFolderFavorite(f)}
          />
        </span>
        <span role="cell" className={`${COL.mode} text-gray-400`}>
          폴더
        </span>
        <span role="cell" className={COL.date}>
          {shortDate(f.createdAt)}
        </span>
      </div>
    ))}

    {files.map((f) => {
      const meta = MODE_LABEL[f.mode] ?? { label: f.mode, color: '#9ebaee' };
      const busy = isInProgress(f.status);
      const failed = f.status === 'FAILED';
      const isPreviewed = previewId === f.jobId;
      const isSelected = selectedIds.has(f.jobId);
      return (
        <div
          key={f.jobId}
          role="row"
          tabIndex={0}
          aria-selected={isSelected}
          draggable={!busy}
          onDragStart={(e) => {
            e.dataTransfer.setData('text/plain', f.originalFileName);
            e.dataTransfer.effectAllowed = 'move';
            onDragStartFile(f);
          }}
          onDragEnd={onDragEnd}
          onClick={(e) => onClickFile(f, e)}
          onDoubleClick={() => onOpenFile(f)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') onOpenFile(f);
          }}
          onContextMenu={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onFileMenu(f, e.clientX, e.clientY);
          }}
          title={`${f.originalFileName} — 두 번 눌러 열기`}
          className={`group flex cursor-pointer items-center gap-3 border-b border-gray-100 px-3 py-1.5 text-[13px] transition-colors ${
            isSelected
              ? 'bg-[#e6eefb]'
              : isPreviewed
                ? 'bg-[#f3f6fb]'
                : 'hover:bg-[#f3f6fb]'
          }`}
        >
          <span role="cell" className={COL.name}>
            <FileText
              size={15}
              fill={meta.color}
              className="shrink-0 text-white"
            />
            <span className="truncate text-gray-800">{f.originalFileName}</span>
            {busy && (
              <span className="shrink-0 text-[11px] text-[#5b8ce6]">
                변환 중{f.progress != null ? ` ${f.progress}%` : ''}
              </span>
            )}
            {failed && (
              <span className="shrink-0 text-[11px] font-semibold text-[#ff3b30]">
                실패
              </span>
            )}
            {showLocation && (
              <span className="shrink-0 truncate text-[11px] text-gray-400">
                {f.folderPath ?? '전체'}
              </span>
            )}
            <FavoriteStar
              isFavorite={f.isFavorite}
              onToggle={() => onToggleFileFavorite(f)}
            />
          </span>
          <span role="cell" className={COL.mode} style={{ color: meta.color }}>
            {meta.label}
          </span>
          <span role="cell" className={COL.date}>
            {f.displayDate}
          </span>
        </div>
      );
    })}
  </div>
);

interface PreviewProps {
  file: FileCard | null;
  onOpen: (file: FileCard) => void;
  onDownload: (file: FileCard) => void;
}

export const PreviewPane: React.FC<PreviewProps> = ({
  file,
  onOpen,
  onDownload,
}) => {
  if (!file) {
    return (
      <div className="flex h-full items-center justify-center px-6 text-center text-[13px] text-gray-400">
        목록에서 파일을 누르면
        <br />
        미리보기가 여기에 뜹니다
      </div>
    );
  }

  const meta = MODE_LABEL[file.mode] ?? { label: file.mode, color: '#9ebaee' };
  const busy = isInProgress(file.status);

  return (
    <div className="flex h-full flex-col p-4">
      <div className="aspect-[169/94] w-full shrink-0 overflow-hidden rounded-[10px] border border-gray-200 bg-gray-100">
        {file.thumbnailUrl ? (
          <img
            src={file.thumbnailUrl}
            alt=""
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <FileText
              size={34}
              style={{ color: meta.color }}
              className="opacity-40"
            />
          </div>
        )}
      </div>

      <p
        title={file.originalFileName}
        className="mt-3 truncate text-[14px] font-bold text-gray-900"
      >
        {file.originalFileName}
      </p>

      <dl className="mt-3 space-y-1.5 text-[12px]">
        {(
          [
            ['모드', meta.label],
            ['작성일', file.displayDate],
            ['쪽 수', `${file.totalPages}쪽`],
            ['위치', file.folderPath ?? '전체'],
            [
              '상태',
              busy
                ? `변환 중${file.progress != null ? ` ${file.progress}%` : ''}`
                : file.status === 'FAILED'
                  ? '실패'
                  : '완료',
            ],
          ] as const
        ).map(([k, v]) => (
          <div key={k} className="flex gap-2">
            <dt className="w-[44px] shrink-0 text-gray-400">{k}</dt>
            <dd className="min-w-0 flex-1 truncate text-gray-700">{v}</dd>
          </div>
        ))}
      </dl>

      <div className="mt-auto flex gap-2 pt-4">
        <button
          type="button"
          disabled={busy || file.status === 'FAILED'}
          onClick={() => onOpen(file)}
          className="flex h-[34px] flex-1 items-center justify-center gap-1.5 rounded-[8px] bg-[#5b8ce6] text-[12px] font-semibold text-white transition-colors hover:bg-[#4a7bd4] disabled:opacity-40"
        >
          <ExternalLink size={13} /> 열기
        </button>
        <button
          type="button"
          disabled={file.status !== 'COMPLETED'}
          onClick={() => onDownload(file)}
          className="flex h-[34px] items-center justify-center gap-1.5 rounded-[8px] border border-gray-200 px-3 text-[12px] font-semibold text-gray-600 transition-colors hover:bg-gray-50 disabled:opacity-40"
        >
          <Download size={13} /> 다운로드
        </button>
      </div>
    </div>
  );
};
