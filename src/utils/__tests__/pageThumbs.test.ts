import { describe, it, expect, beforeEach } from 'vitest';
import {
  captureThumb,
  clearThumbs,
  dropOtherDocs,
  getThumb,
  putThumb,
  thumbKey,
} from '../pageThumbs';

const thumb = (w = 160, h = 226) => ({ src: `data:image/jpeg;base64,${w}`, w, h });

describe('쪽 축소본 캐시', () => {
  beforeEach(() => clearThumbs());

  it('문서와 쪽으로 자리를 가른다 — 다른 작업의 그림이 뜨면 안 된다', () => {
    expect(thumbKey('job-a', 3)).not.toBe(thumbKey('job-b', 3));
    expect(thumbKey('job-a', 3)).not.toBe(thumbKey('job-a', 4));
    // 작업 id가 아직 없어도(업로드 직후) 키는 만들어진다.
    expect(thumbKey(null, 1)).toBe('none:1');
  });

  it('담아 두면 다시 꺼낼 수 있다', () => {
    putThumb('job-a:1', thumb());
    expect(getThumb('job-a:1')?.w).toBe(160);
  });

  it('없는 쪽은 null — 호출부가 이전 쪽을 그대로 보여 준다', () => {
    expect(getThumb('처음 보는 쪽')).toBeNull();
  });

  it('읽기는 아무것도 바꾸지 않는다 — 렌더 중에 부른다', () => {
    putThumb('job-a:1', thumb(160));
    putThumb('job-a:2', thumb(161));
    const before = getThumb('job-a:1');
    const after = getThumb('job-a:1');
    expect(after).toBe(before);
    // 읽어도 순서가 바뀌지 않아 뒤에 담은 것이 여전히 최근이다.
    expect(getThumb('job-a:2')?.w).toBe(161);
  });

  it('상한을 넘으면 오래된 것부터 버린다', () => {
    for (let i = 0; i < 30; i += 1) putThumb(`job-a:${i}`, thumb(i + 1));
    expect(getThumb('job-a:0')).toBeNull();
    expect(getThumb('job-a:29')).not.toBeNull();
  });

  it('같은 쪽을 다시 담으면 덮어쓴다', () => {
    putThumb('job-a:1', thumb(160));
    putThumb('job-a:1', thumb(120));
    expect(getThumb('job-a:1')?.w).toBe(120);
  });

  it('작업을 갈아타면 남의 축소본만 버린다', () => {
    putThumb(thumbKey('job-a', 1), thumb(160));
    putThumb(thumbKey('job-a', 2), thumb(161));
    putThumb(thumbKey('job-b', 1), thumb(162));
    dropOtherDocs('job-a');
    expect(getThumb(thumbKey('job-a', 1))).not.toBeNull();
    expect(getThumb(thumbKey('job-a', 2))).not.toBeNull();
    expect(getThumb(thumbKey('job-b', 1))).toBeNull();
  });

  it('버려도 상한을 나눠 쓰던 자리가 돌아온다 — 옛 문서가 지금 쪽을 밀어내면 안 된다', () => {
    // 옛 문서로 캐시를 가득 채운 뒤 갈아타면, 지금 문서가 상한을 온전히 쓴다.
    for (let i = 0; i < 24; i += 1) putThumb(thumbKey('old', i), thumb(i + 1));
    dropOtherDocs('new');
    for (let i = 0; i < 24; i += 1) putThumb(thumbKey('new', i), thumb(i + 1));
    expect(getThumb(thumbKey('new', 0))).not.toBeNull();
    expect(getThumb(thumbKey('new', 23))).not.toBeNull();
  });

  it('같은 문서로 돌아오면 그대로 남는다 — 다시 그리게 만들면 캐시를 둔 뜻이 없다', () => {
    putThumb(thumbKey('job-a', 5), thumb(160));
    dropOtherDocs('job-a');
    dropOtherDocs('job-a');
    expect(getThumb(thumbKey('job-a', 5))).not.toBeNull();
  });

  it('작업 id가 아직 없는 업로드본도 서로 섞이지 않는다', () => {
    // blob: URL은 콜론을 품지만 앞자리 대조라 서로를 잡아먹지 않는다.
    putThumb(thumbKey('blob:http://x/aaa', 1), thumb(160));
    putThumb(thumbKey('blob:http://x/bbb', 1), thumb(161));
    dropOtherDocs('blob:http://x/bbb');
    expect(getThumb(thumbKey('blob:http://x/aaa', 1))).toBeNull();
    expect(getThumb(thumbKey('blob:http://x/bbb', 1))?.w).toBe(161);
  });

  it('빈 캔버스는 조용히 넘어간다 — 편의 기능이 화면을 막으면 안 된다', () => {
    const canvas = document.createElement('canvas');
    canvas.width = 0;
    canvas.height = 0;
    expect(captureThumb(canvas)).toBeNull();
  });

  it('2D 컨텍스트를 못 얻어도 던지지 않는다', () => {
    const canvas = document.createElement('canvas');
    canvas.width = 800;
    canvas.height = 1131;
    expect(() => captureThumb(canvas)).not.toThrow();
  });
});
