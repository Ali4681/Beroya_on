import { applyDecorators } from '@nestjs/common';
import { ApiResponse } from '@nestjs/swagger';
import { GO_ERROR_HTTP_STATUS, GoErrorCode } from '../errors/go-error-codes';
import { ErrorResponseDto } from './error-response.dto';

/** Documents the possible error codes of an endpoint, grouped by HTTP status. */
export const ApiGoErrors = (...codes: GoErrorCode[]) => {
  const byStatus = new Map<number, GoErrorCode[]>();
  for (const code of codes) {
    const status = GO_ERROR_HTTP_STATUS[code];
    byStatus.set(status, [...(byStatus.get(status) ?? []), code]);
  }
  return applyDecorators(
    ...[...byStatus.entries()].map(([status, list]) =>
      ApiResponse({ status, type: ErrorResponseDto, description: `code: ${list.join(' | ')}` }),
    ),
  );
};
