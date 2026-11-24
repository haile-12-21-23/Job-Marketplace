import { API_VERSION } from '@jmp/contracts';

export const API_NAME = 'Job Marketplace API';
export const API_BASE_PATH = `/api/${API_VERSION}`;

export { createApp } from './app.js';
export { AppError } from './errors/app-error.js';
export { logger } from './observability/logger.js';
