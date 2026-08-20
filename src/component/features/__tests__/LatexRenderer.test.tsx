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

  // OCR 초안은 수식 안에 한글이 그대로 들어온다("$속도 = \\frac{거리}{시간}$").
  // KaTeX 기본(strict) 설정은 이걸 오류로 보고 수식 전체를 붉은 원문으로 떨어뜨려,
  // 화면에서는 "어떤 수식은 뜨고 어떤 수식은 안 뜨는" 것으로 보였다(2026-08-20 QA).
  it('수식 안에 한글이 섞여도 그린다', () => {
    const { container } = render(
      <LatexRenderer text={'$속도 = \\frac{거리}{시간}$'} />,
    );
    expect(container.querySelector('.katex')).toBeTruthy();
  });

  it('여러 줄 환경(\\begin{align})도 그린다', () => {
    const { container } = render(
      <LatexRenderer text={'\\begin{align}a &= b \\\\ c &= d\\end{align}'} />,
    );
    expect(container.querySelector('.katex')).toBeTruthy();
  });

  it('returns null for empty input', () => {
    const { container } = render(<LatexRenderer text="" />);
    // Wrapper div renders but is empty
    expect(container.textContent).toBe('');
  });
});
