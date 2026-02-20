// src/hooks/useJobStream.ts
import { useEffect, useState } from 'react';
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

  useEffect(() => {
    if (!jobId) {
      setIsStreaming(false);
      return;
    }

    // 💡 핵심 수정: 하드코딩 제거하고 API_BASE_URL 사용
    // 로컬에서는 '/api/v1/job/...', 배포에서는 'https://34.64.201.254/api/v1/job/...' 가 됩니다.
    const url = `${API_BASE_URL}/job/${jobId}/events`;

    // 🔥 주의: 프로덕션 환경에서 타 도메인으로 EventSource 요청 시
    // 백엔드에서 CORS 설정이 되어있어야 정상 작동합니다.
    const eventSource = new EventSource(url);
    setIsStreaming(true);


    // 생략: 기존 코드와 동일하게 유지하시면 됩니다.
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