import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import ErrorBoundary from './component/shared/ErrorBoundary';
import { initClientOs } from './utils/clientOs';
import { initDiagLog } from './utils/diagLog';
import './index.css';
import 'katex/dist/katex.min.css';

// 접속 환경(OS)은 시작할 때 한 번 구해 두고, 이후 모든 API 요청에 헤더로 실린다.
void initClientOs();
// 잡히지 않은 오류를 로그 파일로 — 재현 안 되는 현장 제보의 유일한 단서다.
initDiagLog();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);
