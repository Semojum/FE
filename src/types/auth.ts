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

export interface AuthResponse {
  token: string;
  user: User;
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
