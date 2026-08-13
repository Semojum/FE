import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import BBoxOverlay from '../conversion/BboxOverlay';

const bboxes = [
  { id: '1', x: 100, y: 200, x2: 300, y2: 400 },
  { id: '2', x: 500, y: 600, x2: 700, y2: 800 },
];

describe('BBoxOverlay', () => {
  it('renders nothing when bboxes empty', () => {
    const { container } = render(
      <BBoxOverlay
        bboxes={[]}
        selectedId={null}
        originalResolution={{ width: 1000, height: 1000 }}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing when resolution is 0', () => {
    const { container } = render(
      <BBoxOverlay
        bboxes={bboxes}
        selectedId={null}
        originalResolution={{ width: 0, height: 0 }}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('positions boxes as percentages of original resolution', () => {
    const { container } = render(
      <BBoxOverlay
        bboxes={bboxes}
        selectedId={null}
        originalResolution={{ width: 1000, height: 1000 }}
      />,
    );
    const boxes = container.querySelectorAll('[style*="left"]');
    expect(boxes).toHaveLength(2);
    // first box: x=100 → 10%, width=(300-100)=200 → 20%
    const styleStr = boxes[0].getAttribute('style') ?? '';
    expect(styleStr).toContain('10%');
    expect(styleStr).toContain('20%');
  });

  it('clicking a box fires onBlockClick with id', async () => {
    const onBlockClick = vi.fn();
    const { container } = render(
      <BBoxOverlay
        bboxes={bboxes}
        selectedId={null}
        originalResolution={{ width: 1000, height: 1000 }}
        onBlockClick={onBlockClick}
      />,
    );
    const boxes = container.querySelectorAll('[style*="left"]');
    await userEvent.click(boxes[1]);
    expect(onBlockClick).toHaveBeenCalledWith('2');
  });

  it('selected box gets selected styling class', () => {
    const { container } = render(
      <BBoxOverlay
        bboxes={bboxes}
        selectedId="2"
        originalResolution={{ width: 1000, height: 1000 }}
      />,
    );
    const boxes = container.querySelectorAll('[style*="left"]');
    expect(boxes[1].className).toMatch(/border-\[#5A8FBB\]/);
    expect(boxes[0].className).not.toMatch(/border-\[#5A8FBB\]\s/);
  });

  // 결과 격자에서 얹었을 때도 원본 쪽에 상자가 떠야 하므로 CSS :hover가 아니라 상태로 그린다.
  it('상위가 준 hoveredId의 박스만 hover 표시를 한다', () => {
    const { container } = render(
      <BBoxOverlay
        bboxes={bboxes}
        selectedId={null}
        hoveredId="2"
        originalResolution={{ width: 1000, height: 1000 }}
      />,
    );
    const boxes = container.querySelectorAll('[style*="left"]');
    expect(boxes[0].className).toContain('border-transparent');
    expect(boxes[1].className).toContain('border-[#5A8FBB]/40');
  });

  it('박스에 마우스를 얹으면 상위에 id를 알린다', async () => {
    const onBlockHover = vi.fn();
    const user = userEvent.setup();
    const { container } = render(
      <BBoxOverlay
        bboxes={bboxes}
        selectedId={null}
        onBlockHover={onBlockHover}
        originalResolution={{ width: 1000, height: 1000 }}
      />,
    );
    const boxes = container.querySelectorAll('[style*="left"]');
    await user.hover(boxes[0]);
    expect(onBlockHover).toHaveBeenCalledWith('1');
    await user.unhover(boxes[0]);
    expect(onBlockHover).toHaveBeenCalledWith(null);
  });
});
