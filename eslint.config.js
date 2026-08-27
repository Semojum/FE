import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';

// 훅이 무거운 코드베이스다 — useEffect/useCallback 의존성 실수는 그동안 사람이
// 실측으로 잡아 왔다(2026-08 QA에서 쪽 전환·복원 꼬임이 다 이 계열이었다).
// rules-of-hooks 위반은 오류로 막고, exhaustive-deps는 경고로 둔다: 이 코드에는
// "일부러 뺀" 의존성이 여럿 있어서(세대 토큰·ref 패턴) 일괄 오류로 두면
// 기계적으로 채워 넣다가 오히려 동작을 바꾸게 된다.
export default tseslint.config(
  { ignores: ['dist/', 'src-tauri/', 'vendor/', 'node_modules/', 'docs/'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-hooks/exhaustive-deps': 'warn',
      // React Compiler 대비 규칙들 — 기존 코드에 31곳이 걸린다. 고치려면 하나하나
      // 동작 검증이 필요한 리팩터링이라, 새 코드가 늘리지 않게 경고로만 보이게 둔다.
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/refs': 'warn',
      'react-hooks/preserve-manual-memoization': 'warn',
      // 의도적인 빈 catch(로그 실패 무시 등)를 쓰는 코드다 — 주석이 있으면 허용.
      'no-empty': ['error', { allowEmptyCatch: true }],
      // `catch (e) {}`에서 e를 안 쓰는 관용구 허용
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          caughtErrors: 'none',
          // `const { text: _t, ...rest } = obj` — 필드 하나를 떼어 내는 관용구 허용
          ignoreRestSiblings: true,
        },
      ],
    },
  },
);
