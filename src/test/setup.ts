import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach } from 'vitest';
import { cleanup } from '@testing-library/react';

// React 18+ DOM cleanup after each test
afterEach(() => {
  cleanup();
});

// Reset localStorage between tests so mocks/sessions don't leak
beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
});
