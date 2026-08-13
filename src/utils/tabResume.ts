// 탭 전환으로 끊긴 변환을 이어 붙이기 위한 판단.
//
// 탭을 떠날 때 resetUpload가 jobId를 비우면서 SSE가 끊긴다. 돌아왔을 때 다시 붙이지
// 않으면 남은 페이지가 영영 도착하지 않고, jobId가 없어 "변환 중"으로도 보이지 않아
// 결과 패널이 "결과가 없습니다"로 남는다.

/** 스냅샷에서 이미 받아 둔 페이지 번호들 — 결과가 온 페이지 + 상태만 온 페이지(BLOCKED 등). */
export const receivedPages = (
  blocksByPage: Record<number, unknown>,
  pageStatuses: Record<number, unknown> = {},
): Set<number> =>
  new Set(
    [...Object.keys(blocksByPage), ...Object.keys(pageStatuses)].map(Number),
  );

/**
 * 이 탭으로 돌아올 때 스트림을 다시 붙여야 하는지.
 * totalPages가 아직 0이면 끝났다고 단정할 수 없으므로 붙인다.
 */
export const needsStreamResume = (
  jobId: string | null | undefined,
  totalPages: number,
  received: Set<number>,
): boolean => !!jobId && (totalPages === 0 || totalPages > received.size);
