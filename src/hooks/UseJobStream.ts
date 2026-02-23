// src/hooks/useJobStream.ts
import { useEffect, useState, useRef } from 'react';
import { StreamPageData } from '../types/apiTypes';

const SSE_LOG_STYLE =
  'background: #7C3AED; color: #fff; padding: 2px 4px; border-radius: 2px; font-weight: bold;';

// 환경 변수 가져오기
const API_BASE_URL = 'https://arknightserver.cloud/api/v1';

interface UseJobStreamProps {
  jobId: string | null;
  onPageReceived: (data: StreamPageData) => void;
  onError?: (error: Event) => void;
  onStatusReceived?: (data: any) => void;
}

export const useJobStream = ({
  jobId,
  onPageReceived,
  onStatusReceived,
  onError,
}: UseJobStreamProps) => {
  const [isStreaming, setIsStreaming] = useState(false);

  // ✅ 1. 최신 콜백 함수를 유지하기 위한 Ref 생성
  const onPageReceivedRef = useRef(onPageReceived);
  const onStatusReceivedRef = useRef(onStatusReceived);
  const onErrorRef = useRef(onError);

  // ✅ 2. 렌더링될 때마다 최신 콜백으로 업데이트 (SSE를 끊지 않고 함수만 교체)
  useEffect(() => {
    onPageReceivedRef.current = onPageReceived;
    onStatusReceivedRef.current = onStatusReceived;
    onErrorRef.current = onError;
  }, [onPageReceived, onStatusReceived, onError]);

  useEffect(() => {
    if (!jobId) {
      setIsStreaming(false);
      return;
    }

    const url = `${API_BASE_URL}/job/${jobId}/events`;
    const eventSource = new EventSource(url);
    setIsStreaming(true);

    eventSource.onopen = () =>
      console.log(`%c 🟢 SSE Connected `, SSE_LOG_STYLE);

    eventSource.addEventListener('page', (event) => {
      const rawData = (event as MessageEvent).data;
      console.log('%c 📥 Raw Page Data:', 'color: #ff00ff', `|${rawData}|`);

      try {
        const parsedData = JSON.parse(rawData);
        // ✅ 3. 실행 시점의 가장 최신 콜백을 호출
        if (onPageReceivedRef.current) {
          onPageReceivedRef.current(parsedData);
        }
      } catch (err) {
        console.error('❌ Page Parse Error:', err);
      }
    });

    eventSource.addEventListener('status', (event) => {
      try {
        const data = JSON.parse((event as MessageEvent).data);
        console.log(
          `%c 📊 Status Received: ${data.status} `,
          'background: #333; color: #fbbf24',
          data,
        );

        if (onStatusReceivedRef.current) {
          onStatusReceivedRef.current(data);
        }

        if (data.status === 'FAILED' || data.done) {
          console.log('%c 🏁 Stream Closing by Status ', 'color: gray');
          eventSource.close();
          setIsStreaming(false);
        }
      } catch (err) {
        console.error('❌ Status Parse Error', err);
      }
    });

    eventSource.onerror = (error) => {
      console.error('❌ SSE Error:', error);
      if (onErrorRef.current) {
        onErrorRef.current(error);
      }
      eventSource.close();
      setIsStreaming(false);
    };

    return () => {
      eventSource.close();
      setIsStreaming(false);
    };
  }, [jobId]); // 🚨 핵심: 의존성 배열에 jobId만 남김 (jobId가 바뀔 때만 재연결)

  return { isStreaming };
};
