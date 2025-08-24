import {
  ArgumentsHost,
  BadRequestException,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { Error as MongooseError } from 'mongoose';
import { MongoServerError } from 'mongodb';

export interface ProblemDetails {
  type: string;
  title: string;
  status: number;
  detail?: string;
  instance?: string;
  errors?: unknown;
}

type HttpExceptionObject = {
  statusCode?: number;
  message?: unknown;
  error?: unknown;
};

type HttpExceptionResponse = string | HttpExceptionObject;

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isHttpExceptionObject(value: unknown): value is HttpExceptionObject {
  return isObject(value);
}

@Catch()
export class ProblemDetailsFilter implements ExceptionFilter {
  private readonly logger = new Logger(ProblemDetailsFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const { status, title, detail, errors } = this.mapException(exception);

    // Log unhandled/unknown server errors for diagnostics
    if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      if (exception instanceof Error) {
        this.logger.error(exception.message, exception.stack);
      } else {
        this.logger.error(`Unknown error: ${String(exception)}`);
      }
    }

    const problem: ProblemDetails = {
      type: 'about:blank',
      title,
      status,
      detail,
      instance: request.originalUrl,
      ...(errors !== undefined ? { errors } : {}),
    };

    response.status(status);
    response.setHeader('Content-Type', 'application/problem+json');
    response.json(problem);
  }

  private mapException(exception: unknown): {
    status: HttpStatus;
    title: string;
    detail?: string;
    errors?: unknown;
  } {
    if (exception instanceof HttpException) {
      const status = exception.getStatus() as HttpStatus;
      const res: HttpExceptionResponse = exception.getResponse();

      let title = this.statusTitle(status);
      let detail: string | undefined;
      let errorsOut: unknown;

      if (typeof res === 'string') {
        detail = res;
      } else if (isHttpExceptionObject(res)) {
        if (typeof res.error === 'string') {
          title = res.error;
        }
        const msg = res.message;
        if (Array.isArray(msg)) {
          errorsOut = msg;
          detail = msg.join(', ');
        } else if (typeof msg === 'string') {
          detail = msg;
        }
      }

      if (!detail && exception instanceof Error) {
        detail = exception.message;
      }

      // Special handling: expose validation messages in errors when BAD_REQUEST
      if (
        status === HttpStatus.BAD_REQUEST &&
        exception instanceof BadRequestException
      ) {
        return {
          status,
          title,
          detail,
          ...(errorsOut !== undefined ? { errors: errorsOut } : {}),
        };
      }

      return { status, title, detail };
    }

    // Mongoose/MongoDB mappings
    // 1) Mongoose ValidationError -> 400
    if (this.isMongooseValidationError(exception)) {
      const e = exception;
      const messages = Object.values(e.errors ?? {})
        .map((x) => {
          const msg = (x as { message?: string }).message;
          if (typeof msg === 'string' && msg.length > 0) return msg;
          try {
            return JSON.stringify(x);
          } catch {
            return undefined;
          }
        })
        .filter((m): m is string => typeof m === 'string');
      const detail =
        messages.length > 0 ? messages.join(', ') : 'Validation failed';
      return {
        status: HttpStatus.BAD_REQUEST,
        title: this.statusTitle(HttpStatus.BAD_REQUEST),
        detail,
        errors: messages,
      };
    }

    // 2) Mongoose CastError -> 400
    if (this.isMongooseCastError(exception)) {
      const e = exception;
      const path = (e as { path?: string }).path ?? 'field';
      const detail = `Invalid value for ${String(path)}`;
      return {
        status: HttpStatus.BAD_REQUEST,
        title: this.statusTitle(HttpStatus.BAD_REQUEST),
        detail,
      };
    }

    // 3) MongoServerError duplicate key -> 409 Conflict
    if (this.isMongoServerError(exception)) {
      const e = exception;
      if (e.code === 11000) {
        // Debug logging to help diagnose unique index conflicts during tests
        try {
          const name = (e as { name?: string }).name;
          const message = (e as { message?: string }).message;
          const keyPattern = (e as { keyPattern?: Record<string, unknown> })
            .keyPattern;
          const keyValue = (e as { keyValue?: Record<string, unknown> })
            .keyValue;
          this.logger.warn(
            `Mongo duplicate key 11000: ${message} keyPattern=${
              keyPattern ? JSON.stringify(keyPattern) : 'n/a'
            } keyValue=${keyValue ? JSON.stringify(keyValue) : 'n/a'} name=${
              name ?? 'MongoServerError'
            }`,
          );
        } catch (logErr) {
          // Fallback when extracting debug fields fails (avoid empty catch)
          this.logger.warn(
            'Mongo duplicate key 11000: failed to extract debug fields',
            logErr as Error,
          );
        }
        const keyPattern = (e as { keyPattern?: Record<string, unknown> })
          .keyPattern;
        const fields = keyPattern
          ? Object.keys(keyPattern).join(', ')
          : undefined;
        const detail = fields
          ? `Duplicate value for unique field(s): ${fields}`
          : 'Duplicate key conflict';
        return {
          status: HttpStatus.CONFLICT,
          title: this.statusTitle(HttpStatus.CONFLICT),
          detail,
        };
      }
      return {
        status: HttpStatus.INTERNAL_SERVER_ERROR,
        title: this.statusTitle(HttpStatus.INTERNAL_SERVER_ERROR),
        detail: e.message,
      };
    }

    // Unknown error
    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      title: this.statusTitle(HttpStatus.INTERNAL_SERVER_ERROR),
      detail:
        exception instanceof Error
          ? exception.message
          : 'Internal Server Error',
    };
  }

  private statusTitle(status: number): string {
    const map: Record<number, string> = {
      [HttpStatus.BAD_REQUEST]: 'Bad Request',
      [HttpStatus.UNAUTHORIZED]: 'Unauthorized',
      [HttpStatus.FORBIDDEN]: 'Forbidden',
      [HttpStatus.NOT_FOUND]: 'Not Found',
      [HttpStatus.CONFLICT]: 'Conflict',
      [HttpStatus.UNPROCESSABLE_ENTITY]: 'Unprocessable Entity',
      [HttpStatus.INTERNAL_SERVER_ERROR]: 'Internal Server Error',
      [HttpStatus.SERVICE_UNAVAILABLE]: 'Service Unavailable',
    };
    return map[status] ?? `Error ${status}`;
  }

  private isMongooseValidationError(
    e: unknown,
  ): e is MongooseError.ValidationError {
    return !!e && (e as { name?: string }).name === 'ValidationError';
  }

  private isMongooseCastError(e: unknown): e is MongooseError.CastError {
    return !!e && (e as { name?: string }).name === 'CastError';
  }

  private isMongoServerError(e: unknown): e is MongoServerError {
    return e instanceof MongoServerError;
  }
}
