// src/hooks/useJobStream.ts
import { useEffect, useState, useRef } from 'react';
import { StreamPageData, StreamStatusData } from '../types/apiTypes';
import { API_BASE_URL } from '../api/JobService';

interface UseJobStreamProps {
  jobId: string | null;
  onPageReceived: (data: StreamPageData) => void;
  onError?: (error: Event) => void;
  onStatusReceived?: (data: StreamStatusData) => void;
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

    eventSource.addEventListener('page', (event) => {
      const rawData = (event as MessageEvent).data;
      try {
        const parsedData = JSON.parse(rawData) as StreamPageData;
        onPageReceivedRef.current?.(parsedData);
      } catch (err) {
        console.error('Page parse error:', err);
      }
    });

    eventSource.addEventListener('status', (event) => {
      try {
        const data = JSON.parse((event as MessageEvent).data) as StreamStatusData;
        onStatusReceivedRef.current?.(data);

        if (data.status === 'FAILED' || data.done) {
          eventSource.close();
          setIsStreaming(false);
        }
      } catch (err) {
        console.error('Status parse error:', err);
      }
    });

    eventSource.onerror = (error) => {
      console.error('SSE error:', error);
      onErrorRef.current?.(error);
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
