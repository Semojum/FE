// src/api/jobService.ts
import { StartJobResponse, JobMode } from '../types/apiTypes';

// 환경별 분기: VITE_API_BASE_URL 미설정 시 운영 URL 폴백
export const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ?? 'https://arknightserver.cloud/api/v1';

export const startJob = async (
  file: File,
  mode: JobMode,
): Promise<StartJobResponse> => {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('mode', mode);

  try {
    // API_BASE_URL에 이미 /v1이 포함되어 있으므로 바로 /job/start를 붙입니다.
    const response = await fetch(`${API_BASE_URL}/job/start`, {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      throw new Error(`API Error: ${response.status} ${response.statusText}`);
    }

    // 🛡️ 방어적 로직: 응답이 진짜 JSON인지 확인 (SPA Fallback HTML 방지)
    const contentType = response.headers.get('content-type');
    if (contentType && contentType.includes('application/json')) {
      return await response.json();
    } else {
      const text = await response.text();
      throw new Error(
        `응답이 JSON이 아닙니다. URL이나 프록시 설정을 확인하세요. 미리보기: ${text.slice(0, 50)}`,
      );
    }
  } catch (error) {
    console.error('Job Start Failed:', error);
    throw error;
  }
};
