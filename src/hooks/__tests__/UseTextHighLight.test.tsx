import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { useTextHighlight } from '../UseTextHighLight';

const Wrapper: React.FC<{ text: string }> = ({ text }) => {
  const node = useTextHighlight(text);
  return <div data-testid="hl">{node}</div>;
};

describe('useTextHighlight', () => {
  it('returns plain text untouched', () => {
    const { getByTestId } = render(<Wrapper text="안녕하세요" />);
    expect(getByTestId('hl').textContent).toBe('안녕하세요');
    // No dim spans
    expect(getByTestId('hl').querySelectorAll('.opacity-50')).toHaveLength(0);
  });

  it('wraps <!...> matches in dim span', () => {
    const { getByTestId } = render(
      <Wrapper text="hello <!world> end" />,
    );
    const dim = getByTestId('hl').querySelector('.opacity-50');
    expect(dim?.textContent).toBe('<!world>');
  });

  it('handles multiple matches', () => {
    const { getByTestId } = render(
      <Wrapper text="<!a> middle <!b>" />,
    );
    const dims = getByTestId('hl').querySelectorAll('.opacity-50');
    expect(dims).toHaveLength(2);
    expect(dims[0].textContent).toBe('<!a>');
    expect(dims[1].textContent).toBe('<!b>');
  });

  it('renders empty input without crashing', () => {
    const { getByTestId } = render(<Wrapper text="" />);
    expect(getByTestId('hl').textContent).toBe('');
  });
});
