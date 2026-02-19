// src/hooks/useJobStream.ts
import { useEffect, useState } from 'react';
import { StreamPageData } from '../types/apiTypes';

// 로그 스타일 정의 (보라색 계열)
const SSE_LOG_STYLE =
  'background: #7C3AED; color: #fff; padding: 2px 4px; border-radius: 2px; font-weight: bold;';

interface UseJobStreamProps {
  jobId: string | null;
  onPageReceived: (data: StreamPageData) => void;
  onError?: (error: Event) => void;
}

export const useJobStream = ({
  jobId,
  onPageReceived,
  onStatusReceived, // ✅ 상태 수신 콜백 추가
  onError,
}: UseJobStreamProps & { onStatusReceived?: (data: any) => void }) => {
  // 타입 확장
  const [isStreaming, setIsStreaming] = useState(false);

  useEffect(() => {
    if (!jobId) {
      setIsStreaming(false);
      return;
    }

    const url = `/api/v1/job/${jobId}/events`;
    const eventSource = new EventSource(url);
    setIsStreaming(true);

    // 1. 연결 성공
    eventSource.onopen = () =>
      console.log(`%c 🟢 SSE Connected `, SSE_LOG_STYLE);

    // 2. 'page' 이벤트 리스너 (기존 동일)
    eventSource.addEventListener('page', (event) => {
      const rawData = (event as MessageEvent).data;
      console.log('%c 📥 Raw Page Data:', 'color: #ff00ff', `|${rawData}|`); // 데이터 앞뒤에 |를 붙여 공백 확인

      try {
        const parsedData = JSON.parse(rawData);
        onPageReceived(parsedData);
      } catch (err) {
        console.error('❌ Page Parse Error:', err);
        console.error('Problematic String:', rawData); // 에러난 문자열 직접 확인
      }
    });

    // 3. ✅ 'status' 이벤트 리스너 추가
    eventSource.addEventListener('status', (event) => {
      try {
        const data = JSON.parse((event as MessageEvent).data);
        console.log(
          `%c 📊 Status Received: ${data.status} `,
          'background: #333; color: #fbbf24',
          data,
        );

        if (onStatusReceived) onStatusReceived(data);

        // ✅ 만약 status가 FAILED이거나 done이 true라면 스트림 종료
        if (data.status === 'FAILED' || data.done) {
          console.log('%c 🏁 Stream Closing by Status ', 'color: gray');
          eventSource.close();
          setIsStreaming(false);
        }
      } catch (err) {
        console.error('❌ Status Parse Error', err);
      }
    });

    // 4. 에러 핸들러
    eventSource.onerror = (error) => {
      console.error('❌ SSE Error:', error);
      if (onError) onError(error);
      eventSource.close();
      setIsStreaming(false);
    };

    return () => {
      eventSource.close();
      setIsStreaming(false);
    };
  }, [jobId, onPageReceived, onStatusReceived, onError]);

  return { isStreaming };
};