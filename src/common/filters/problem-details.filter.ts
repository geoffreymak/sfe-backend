import {
  ArgumentsHost,
  BadRequestException,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Request, Response } from 'express';

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
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const { status, title, detail, errors } = this.mapException(exception);

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
}
