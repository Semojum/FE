import React from 'react';
import { logDiag } from '../../utils/diagLog';

// 렌더 중 예외가 나면 리액트는 트리를 통째로 떼어 낸다 — 경계가 하나도 없으면
// 화면이 새하얘지고, 사용자는 무엇이 잘못됐는지도 알 수 없다.
// (2026-08-20 기관 관리 화면이 서버 응답 필드 하나 때문에 그렇게 죽었다.)
// 여기서 받아 두면 최소한 "무엇이 잘못됐는지"와 되돌아갈 길을 보여 줄 수 있다.

interface Props {
  children: React.ReactNode;
  // 이 경계가 감싸는 곳의 이름 — 안내 문구에 쓴다.
  label?: string;
  // 다시 시도 버튼을 눌렀을 때 화면 쪽에서 정리할 것이 있으면 받는다.
  onReset?: () => void;
}

interface State {
  error: Error | null;
}

class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // 데스크톱 앱이라 원격 로그가 없다 — 진단 로그 파일에 남겨 문의 때 붙일 수 있게 한다.
    logDiag('화면 오류', this.props.label ?? '(전체)', error);
    if (info.componentStack) {
      logDiag(
        '화면 오류',
        '컴포넌트 위치',
        info.componentStack.split('\n').slice(0, 6).join(' « '),
      );
    }
  }

  private handleReset = () => {
    this.setState({ error: null });
    this.props.onReset?.();
  };

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div
        role="alert"
        className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center"
      >
        <p className="text-[15px] font-bold text-gray-700">
          {this.props.label ? `${this.props.label}을(를) ` : '화면을 '}
          그리는 중 문제가 생겼습니다.
        </p>
        <p className="max-w-[420px] break-words text-[12px] text-gray-500">
          {error.message}
        </p>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={this.handleReset}
            className="rounded-[6px] bg-[#f47726] px-4 py-2 text-[12px] font-bold text-white transition-colors hover:brightness-95"
          >
            다시 시도
          </button>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="rounded-[6px] border border-[#e2e8f0] bg-white px-4 py-2 text-[12px] font-bold text-gray-700 transition-colors hover:border-[#5b8ce6]/50 hover:text-[#5b8ce6]"
          >
            앱 새로 시작
          </button>
        </div>
        {/* 토큰을 메모리에만 두는 설계라 새로 시작하면 로그인부터 다시 한다. */}
        <p className="text-[11px] text-gray-400">
          앱을 새로 시작하면 로그인 화면부터 다시 시작합니다.
        </p>
      </div>
    );
  }
}

export default ErrorBoundary;
