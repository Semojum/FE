import {
  BoundingBox,
  ConversionTab,
  ImageResolution,
  OriginalTextBlock,
  TranslationBlock,
} from './index';

export interface User {
  id: string;
  email: string;
  name: string;
}

// POST /api/auth/signup 응답 (result) — 토큰을 발급하지 않는다.
export interface SignupResponse {
  email: string;
  name: string;
}

// POST /api/auth/login 응답 (result)
export interface LoginResponse {
  accessToken: string;
  refreshToken: string;
}

export interface JobSummary {
  id: string;
  title: string;
  mode: ConversionTab;
  fileName: string;
  createdAt: string; // ISO 8601
}

export interface JobDetail extends JobSummary {
  totalPages: number;
  blocksByPage: Record<number, TranslationBlock[]>;
  bboxDataByPage: Record<number, BoundingBox[]>;
  originalTextsByPage: Record<number, OriginalTextBlock[]>;
  imgResolution: ImageResolution;
}

export interface SaveJobInput {
  title: string;
  mode: ConversionTab;
  fileName: string;
  totalPages: number;
  blocksByPage: Record<number, TranslationBlock[]>;
  bboxDataByPage: Record<number, BoundingBox[]>;
  originalTextsByPage: Record<number, OriginalTextBlock[]>;
  imgResolution: ImageResolution;
}
