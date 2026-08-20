import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import ErrorBoundary from './component/shared/ErrorBoundary';
import { initClientOs } from './utils/clientOs';
import './index.css';
import 'katex/dist/katex.min.css';

// 접속 환경(OS)은 시작할 때 한 번 구해 두고, 이후 모든 API 요청에 헤더로 실린다.
void initClientOs();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);
