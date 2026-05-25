// src/hooks/useJobStream.ts
import { useEffect, useState, useRef } from 'react';
import {
  JobDoneData,
  QueuePositionData,
  StreamPageData,
} from '../types/apiTypes';
import { API_BASE_URL } from '../api/JobService';

interface UseJobStreamProps {
  jobId: string | null;
  token?: string | null;
  onPageReceived: (data: StreamPageData) => void;
  onJobDone?: (data: JobDoneData) => void;
  onQueuePosition?: (data: QueuePositionData) => void;
  onError?: (error: Event) => void;
}

export const useJobStream = ({
  jobId,
  token,
  onPageReceived,
  onJobDone,
  onQueuePosition,
  onError,
}: UseJobStreamProps) => {
  const [isStreaming, setIsStreaming] = useState(false);

  // ✅ 최신 콜백을 SSE 재연결 없이 교체하기 위한 Ref
  const onPageReceivedRef = useRef(onPageReceived);
  const onJobDoneRef = useRef(onJobDone);
  const onQueuePositionRef = useRef(onQueuePosition);
  const onErrorRef = useRef(onError);

  useEffect(() => {
    onPageReceivedRef.current = onPageReceived;
    onJobDoneRef.current = onJobDone;
    onQueuePositionRef.current = onQueuePosition;
    onErrorRef.current = onError;
  }, [onPageReceived, onJobDone, onQueuePosition, onError]);

  useEffect(() => {
    if (!jobId) {
      setIsStreaming(false);
      return;
    }

    // EventSource는 커스텀 헤더(Authorization)를 지원하지 않으므로
    // 토큰은 쿼리 파라미터로 전달한다. (SSE는 명세상 아직 미구현)
    const base = `${API_BASE_URL}/api/jobs/${jobId}/events`;
    const url = token ? `${base}?token=${encodeURIComponent(token)}` : base;
    const eventSource = new EventSource(url);
    setIsStreaming(true);

    const parse = <T>(event: Event): T | null => {
      try {
        return JSON.parse((event as MessageEvent).data) as T;
      } catch (err) {
        console.error('SSE parse error:', err);
        return null;
      }
    };

    // event: page_done — 페이지 변환 완료
    eventSource.addEventListener('page_done', (event) => {
      const data = parse<StreamPageData>(event);
      if (data) onPageReceivedRef.current?.(data);
    });

    // event: job_done — 전체 변환 완료 → 스트림 종료
    eventSource.addEventListener('job_done', (event) => {
      const data = parse<JobDoneData>(event);
      if (data) onJobDoneRef.current?.(data);
      eventSource.close();
      setIsStreaming(false);
    });

    // event: queue_position — 대기열 위치 안내
    eventSource.addEventListener('queue_position', (event) => {
      const data = parse<QueuePositionData>(event);
      if (data) onQueuePositionRef.current?.(data);
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
  }, [jobId, token]); // jobId/token이 바뀔 때만 재연결

  return { isStreaming };
};
