// 쪽 축소본(썸네일) 캐시 — 쪽을 넘기는 동안 **그 쪽의 흐릿한 그림**을 먼저 보여 준다.
//
// 지금은 다음 쪽을 다 그릴 때까지 **이전 쪽**이 그대로 남는다(이중 슬롯). 빈 화면보다는
// 낫지만, 넘겼는데 화면이 그대로라 "안 넘어갔나?"로 읽힌다. 다 그린 캔버스를 한 번
// 줄여 두면 다음에 그 쪽으로 갈 때 곧바로 늘려 그릴 수 있다 — 사용자는 이전 쪽 대신
// **이 쪽의 흐릿한 그림**을 보고, 다 그려지면 선명해진다.
//
// ⚠ 첫 방문에는 축소본이 없다. 그리고 스캔본에서 시간을 먹는 것은 그리기가 아니라
//   pdf.js의 **이미지 디코드**(4959×7017 한 장이 139MB)라, 작게 그린다고 첫 그림이
//   빨리 나오지도 않는다. 이 캐시가 확실히 버는 것은 **다시 방문하는 쪽**이다
//   (지금은 다 그린 뒤 디코드 캐시를 비우므로 되돌아가면 처음부터 다시 디코드한다).
//
// 크기: 가로 160px JPEG라 한 장이 수 KB다. 24장을 들고 있어도 100KB 남짓으로,
// 디코드 캐시 한 장(139MB)에 견주면 없는 것과 같다.

export interface PageThumb {
  /** data: URL (JPEG) */
  src: string;
  w: number;
  h: number;
}

const THUMB_WIDTH = 160;
const THUMB_QUALITY = 0.6;
// 앞뒤로 오가는 범위를 덮을 만큼만. 넘치면 오래 안 쓴 것부터 버린다.
const KEEP = 24;

const cache = new Map<string, PageThumb>();

export const thumbKey = (docKey: string | null | undefined, page: number) =>
  `${docKey ?? 'none'}:${page}`;

/**
 * 읽기는 **아무것도 바꾸지 않는다** — 렌더 중에 부르기 때문이다. 조회할 때마다
 * 순서를 손대면 그리는 도중에 상태를 바꾸는 셈이 된다. 버리는 순서는 담은 순서로
 * 충분하다(오가는 범위보다 상한이 넉넉하다).
 */
export const getThumb = (key: string): PageThumb | null =>
  cache.get(key) ?? null;

export const putThumb = (key: string, thumb: PageThumb): void => {
  cache.delete(key);
  cache.set(key, thumb);
  for (const old of [...cache.keys()].slice(0, Math.max(0, cache.size - KEEP))) {
    cache.delete(old);
  }
};

/**
 * 다 그려진 캔버스를 줄여 담는다.
 *
 * 큰 캔버스를 그대로 toDataURL 하면 수천만 픽셀을 인코딩하게 되므로, 먼저 작은
 * 캔버스에 옮겨 그린 뒤 그것만 인코딩한다. 실패해도(2D 컨텍스트 없음·오염된
 * 캔버스) 조용히 넘어간다 — 이건 편의 기능이라 화면을 막을 이유가 없다.
 */
export const captureThumb = (
  canvas: HTMLCanvasElement,
): PageThumb | null => {
  const { width, height } = canvas;
  if (!width || !height) return null;
  try {
    const w = Math.min(THUMB_WIDTH, width);
    const h = Math.max(1, Math.round((height / width) * w));
    const small = document.createElement('canvas');
    small.width = w;
    small.height = h;
    const ctx = small.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(canvas, 0, 0, w, h);
    return { src: small.toDataURL('image/jpeg', THUMB_QUALITY), w, h };
  } catch {
    return null;
  }
};

/** 문서를 갈아탈 때 — 남겨 둬도 키가 달라 안 맞지만 메모리를 붙들 이유가 없다. */
export const clearThumbs = (): void => cache.clear();
