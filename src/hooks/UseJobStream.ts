// src/hooks/useJobStream.ts
import { useEffect, useState, useRef } from 'react';
import {
  JobDoneData,
  QueuePositionData,
  StreamPageData,
} from '../types/apiTypes';
import { API_BASE_URL } from '../api/JobService';
import { httpFetch } from '../api/httpFetch';

interface UseJobStreamProps {
  jobId: string | null;
  token?: string | null;
  onPageReceived: (data: StreamPageData) => void;
  onJobDone?: (data: JobDoneData) => void;
  onQueuePosition?: (data: QueuePositionData) => void;
  onError?: (error: unknown) => void;
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

    // 백엔드 SSE는 Authorization: Bearer 헤더만 허용한다(쿼리 ?token=은 401).
    // EventSource는 커스텀 헤더를 못 보내므로, 헤더 인증이 가능한 fetch 스트리밍으로 수신한다.
    const controller = new AbortController();
    let closed = false;

    const close = () => {
      if (closed) return;
      closed = true;
      controller.abort();
      setIsStreaming(false);
    };

    const dispatch = (eventName: string, dataStr: string) => {
      let payload: unknown;
      try {
        payload = JSON.parse(dataStr);
      } catch (err) {
        console.error('SSE parse error:', err);
        return;
      }
      switch (eventName) {
        case 'page_done': // 페이지 변환 완료
          onPageReceivedRef.current?.(payload as StreamPageData);
          break;
        case 'job_done': // 전체 변환 완료 → 스트림 종료
          onJobDoneRef.current?.(payload as JobDoneData);
          close();
          break;
        case 'queue_position': // 대기열 위치 안내
          onQueuePositionRef.current?.(payload as QueuePositionData);
          break;
        default:
          break;
      }
    };

    // SSE 한 프레임("event:"/"data:" 줄들, 빈 줄로 구분)을 파싱해 디스패치한다.
    const parseFrame = (frame: string) => {
      let eventName = 'message';
      const dataLines: string[] = [];
      for (const line of frame.split(/\r?\n/)) {
        if (!line || line.startsWith(':')) continue; // 빈 줄/코멘트 무시
        const colon = line.indexOf(':');
        const field = colon === -1 ? line : line.slice(0, colon);
        let val = colon === -1 ? '' : line.slice(colon + 1);
        if (val.startsWith(' ')) val = val.slice(1); // 선행 공백 1개 제거(SSE 규약)
        if (field === 'event') eventName = val;
        else if (field === 'data') dataLines.push(val);
      }
      if (dataLines.length > 0) dispatch(eventName, dataLines.join('\n'));
    };

    const run = async () => {
      try {
        const res = await httpFetch(`${API_BASE_URL}/api/jobs/${jobId}/events`, {
          headers: {
            Accept: 'text/event-stream',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          signal: controller.signal,
        });

        if (!res.ok || !res.body) {
          throw new Error(`SSE 연결 실패: ${res.status}`);
        }

        setIsStreaming(true);

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          // 완성된 프레임만 처리하고, 마지막 불완전 조각은 버퍼에 남긴다.
          const frames = buffer.split(/\r?\n\r?\n/);
          buffer = frames.pop() ?? '';
          for (const frame of frames) {
            parseFrame(frame);
            if (closed) break;
          }
          if (closed) break;
        }
        setIsStreaming(false);
      } catch (err) {
        if (controller.signal.aborted) return; // 언마운트/jobId 변경에 의한 정상 종료
        console.error('SSE error:', err);
        onErrorRef.current?.(err);
        setIsStreaming(false);
      }
    };

    void run();

    return () => {
      close();
    };
  }, [jobId, token]); // jobId/token이 바뀔 때만 재연결

  return { isStreaming };
};
