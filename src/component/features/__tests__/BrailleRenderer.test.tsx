import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import BrailleRenderer from '../conversion/BrailleRenderer';

describe('BrailleRenderer', () => {
  it('renders the given text', () => {
    const { container } = render(<BrailleRenderer text="⠠⠓⠑⠇⠇⠕" />);
    expect(container.textContent).toBe('⠠⠓⠑⠇⠇⠕');
  });

  it('applies tabular-nums styling for monospace digits', () => {
    const { container } = render(<BrailleRenderer text="123" />);
    const div = container.firstChild as HTMLElement;
    expect(div.style.fontVariantNumeric).toContain('tabular-nums');
  });

  it('marks the wrapper with aria-label for screen readers', () => {
    const { container } = render(<BrailleRenderer text="x" />);
    expect(
      (container.firstChild as HTMLElement).getAttribute('aria-label'),
    ).toBe('점자 텍스트');
  });

  it('forwards extra className', () => {
    const { container } = render(
      <BrailleRenderer text="a" className="custom-cls" />,
    );
    expect(container.firstChild).toHaveClass('custom-cls');
  });
});
