import { describe, it, expect, beforeEach } from 'vitest';
import {
  captureThumb,
  clearThumbs,
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
