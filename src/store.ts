import { create } from 'zustand';

// 1. 창고에 무엇이 들어갈지 규칙(타입)을 정해줍니다.
interface BearState {
  bears: number; // 곰인형 마릿수 (숫자)
  increaseBears: () => void; // 곰인형 늘리는 스위치 (함수)
  resetBears: () => void; // 곰인형 0마리로 초기화 (함수)
}

// 2. 실제 창고(Store)를 만듭니다!
export const useStore = create<BearState>((set) => ({
  bears: 0,
  increaseBears: () => set((state) => ({ bears: state.bears + 1 })),
  resetBears: () => set({ bears: 0 }),
}));
