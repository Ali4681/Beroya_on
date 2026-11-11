import { ValidationError, ValidationPipe } from '@nestjs/common';
import { GoErrorCode } from '../errors/go-error-codes';
import { GoException } from '../errors/go.exception';

interface FieldError {
  field: string;
  messages: string[];
}

function flatten(errors: ValidationError[], parent = ''): FieldError[] {
  return errors.flatMap((e) => {
    const field = parent ? `${parent}.${e.property}` : e.property;
    const own = e.constraints ? [{ field, messages: Object.values(e.constraints) }] : [];
    return [...own, ...flatten(e.children ?? [], field)];
  });
}

/** Validation errors -> 400 `{ code: 'VALIDATION_ERROR', errors: [{ field, messages }] }`. */
export const goValidationPipe = () =>
  new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    transformOptions: { enableImplicitConversion: false },
    exceptionFactory: (errors) =>
      new GoException(GoErrorCode.VALIDATION_ERROR, 'Validation failed', { errors: flatten(errors) }),
  });
