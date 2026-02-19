// src/api/jobService.ts
import { StartJobResponse, JobMode } from '../types/apiTypes';

const API_BASE_URL = '/api/v1';

export const startJob = async (
  file: File,
  mode: JobMode,
): Promise<StartJobResponse> => {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('mode', mode);

  try {
    const response = await fetch(`${API_BASE_URL}/job/start`, {
      method: 'POST',
      body: formData,
      // Content-Type 헤더는 FormData 전송 시 브라우저가 자동으로 'multipart/form-data'와 boundary를 설정하므로 생략해야 합니다.
    });

    if (!response.ok) {
      throw new Error(`API Error: ${response.status} ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Job Start Failed:', error);
    throw error;
  }
};
