import type { ErrorRequestHandler } from 'express';
import type { ApiErrorBody } from '@medbourse/shared';
import multer from 'multer';
import { ZodError } from 'zod';
import { AppError, isAppError } from '../errors/AppError.js';
import { config } from '../config.js';

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof multer.MulterError) {
    const tooLarge = err.code === 'LIMIT_FILE_SIZE';
    const body: ApiErrorBody = {
      error: {
        code: tooLarge ? 'FILE_TOO_LARGE' : 'UPLOAD_ERROR',
        message: tooLarge ? 'File exceeds the 10MB limit' : 'Upload failed',
      },
    };
    res.status(400).json(body);
    return;
  }

  if (err instanceof ZodError) {
    const body: ApiErrorBody = {
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Request validation failed',
        details: err.flatten(),
      },
    };
    res.status(400).json(body);
    return;
  }

  if (isAppError(err)) {
    const body: ApiErrorBody = {
      error: {
        code: err.code,
        message: err.message,
        ...(err.details !== undefined ? { details: err.details } : {}),
      },
    };
    res.status(err.statusCode).json(body);
    return;
  }

  console.error('[medbourse-api] unhandled error', err);

  const body: ApiErrorBody = {
    error: {
      code: 'INTERNAL_ERROR',
      message:
        config.nodeEnv === 'production'
          ? 'An unexpected error occurred'
          : err instanceof Error
            ? err.message
            : 'An unexpected error occurred',
    },
  };
  res.status(500).json(body);
};
