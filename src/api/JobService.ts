// src/api/jobService.ts
import { StartJobResponse, JobMode } from '../types/apiTypes';

// 이제 이 값은 환경에 따라 '/api/v1' 또는 'https://.../api/v1'이 됩니다.
const API_BASE_URL = "http://arknightserver.cloud/api/v1";

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
