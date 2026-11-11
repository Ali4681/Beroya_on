import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Prisma } from '@/generated/prisma/client';
import type { Request, Response } from 'express';
import { localizeErrorMessage, resolveAcceptLanguage } from './error-i18n';
import { GoErrorCode } from './go-error-codes';
import { GoException } from './go.exception';

const STATUS_TO_CODE: Partial<Record<number, GoErrorCode>> = {
  [HttpStatus.BAD_REQUEST]: GoErrorCode.VALIDATION_ERROR,
  [HttpStatus.UNAUTHORIZED]: GoErrorCode.UNAUTHORIZED,
  [HttpStatus.FORBIDDEN]: GoErrorCode.ROLE_NOT_ALLOWED,
  [HttpStatus.NOT_FOUND]: GoErrorCode.NOT_FOUND,
  [HttpStatus.CONFLICT]: GoErrorCode.CONFLICT,
  [HttpStatus.TOO_MANY_REQUESTS]: GoErrorCode.RATE_LIMITED,
  [HttpStatus.SERVICE_UNAVAILABLE]: GoErrorCode.SERVICE_UNAVAILABLE,
};

/**
 * Unified error body:
 * { statusCode, code, message, ...extra, path, timestamp, request_id }
 * `message` follows Accept-Language (ar|en); `code` / `code_detail` stay fixed.
 */
@Catch()
export class GoExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('GoExceptionFilter');

  catch(exception: unknown, host: ArgumentsHost) {
    if (host.getType() !== 'http') throw exception;
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request>();
    const lang = resolveAcceptLanguage(req.headers['accept-language']);

    const { status, body } = this.toBody(exception, lang);
    if (status >= 500) {
      this.logger.error(
        `${req.method} ${req.originalUrl} -> ${status}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    res.status(status).json({
      statusCode: status,
      ...body,
      path: req.originalUrl,
      timestamp: new Date().toISOString(),
      request_id: req.headers['x-request-id'],
    });
  }

  private toBody(exception: unknown, lang: 'ar' | 'en'): { status: number; body: Record<string, unknown> } {
    if (exception instanceof GoException) {
      const raw = exception.getResponse() as Record<string, unknown>;
      const code = String(raw.code ?? exception.code);
      const { message: thrownMessage, ...rest } = raw;
      const message = localizeErrorMessage(
        code,
        lang,
        rest,
        typeof thrownMessage === 'string' ? thrownMessage : undefined,
      );
      return { status: exception.getStatus(), body: { ...rest, code, message } };
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const raw = exception.getResponse();
      const code = STATUS_TO_CODE[status] ?? GoErrorCode.INTERNAL_ERROR;
      const thrown =
        typeof raw === 'string'
          ? raw
          : Array.isArray((raw as { message?: unknown }).message)
            ? undefined
            : String((raw as { message?: unknown }).message ?? exception.message);
      return {
        status,
        body: {
          code,
          message: localizeErrorMessage(code, lang, undefined, thrown),
        },
      };
    }

    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      if (exception.code === 'P2002') {
        return {
          status: HttpStatus.CONFLICT,
          body: {
            code: GoErrorCode.CONFLICT,
            message: localizeErrorMessage(GoErrorCode.CONFLICT, lang, undefined, 'Unique constraint violation'),
            fields: (exception.meta?.target as string[] | undefined) ?? [],
          },
        };
      }
      if (exception.code === 'P2025') {
        return {
          status: HttpStatus.NOT_FOUND,
          body: {
            code: GoErrorCode.NOT_FOUND,
            message: localizeErrorMessage(GoErrorCode.NOT_FOUND, lang, undefined, 'Record not found'),
          },
        };
      }
    }

    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      body: {
        code: GoErrorCode.INTERNAL_ERROR,
        message: localizeErrorMessage(GoErrorCode.INTERNAL_ERROR, lang),
      },
    };
  }
}
