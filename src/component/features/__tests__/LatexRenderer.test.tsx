import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import LatexRenderer from '../conversion/LatexRenderer';

describe('LatexRenderer', () => {
  it('passes plain text through unchanged', () => {
    const { container } = render(<LatexRenderer text="hello world" />);
    expect(container.textContent).toBe('hello world');
  });

  it('renders inline math wrapped in $...$', () => {
    const { container } = render(<LatexRenderer text="값은 $x^2$ 입니다" />);
    // KaTeX outputs a span.katex
    expect(container.querySelector('.katex')).toBeTruthy();
    expect(container.textContent).toContain('값은');
  });

  it('renders display math wrapped in $$...$$', () => {
    const { container } = render(<LatexRenderer text="$$y = mx + b$$" />);
    const display = container.querySelector('.katex-display');
    expect(display).toBeTruthy();
  });

  it('renders \\( ... \\) inline math', () => {
    const { container } = render(<LatexRenderer text={'\\(a+b\\)'} />);
    expect(container.querySelector('.katex')).toBeTruthy();
  });

  it('renders \\[ ... \\] block math', () => {
    const { container } = render(<LatexRenderer text={'\\[a^2+b^2\\]'} />);
    expect(container.querySelector('.katex-display')).toBeTruthy();
  });

  it('returns null for empty input', () => {
    const { container } = render(<LatexRenderer text="" />);
    // Wrapper div renders but is empty
    expect(container.textContent).toBe('');
  });
});
