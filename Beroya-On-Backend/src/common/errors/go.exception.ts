import { HttpException } from '@nestjs/common';
import { GO_ERROR_HTTP_STATUS, GoErrorCode } from './go-error-codes';

/**
 * Throw this for every business error. `extra` fields are merged into the top level of the
 * error body, e.g. `new GoException(GoErrorCode.DRIVER_NOT_ELIGIBLE, undefined, { reasons })`
 * produces `{ code: 'DRIVER_NOT_ELIGIBLE', reasons: [...] , ... }` (Ticket §6.2).
 */
export class GoException extends HttpException {
  constructor(
    public readonly code: GoErrorCode,
    message?: string,
    public readonly extra?: Record<string, unknown>,
  ) {
    super({ code, message: message ?? code, ...extra }, GO_ERROR_HTTP_STATUS[code]);
  }
}
