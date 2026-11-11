import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { GoErrorCode } from '../errors/go-error-codes';

export class FieldErrorDto {
  @ApiProperty({ example: 'phone' })
  field: string;

  @ApiProperty({ example: ['phone must be a valid E.164 number, e.g. +963912345678'] })
  messages: string[];
}

/** Every non-2xx response has this shape. Extra business fields (e.g. `reasons`) may be added at top level. */
export class ErrorResponseDto {
  @ApiProperty({ example: 400 })
  statusCode: number;

  @ApiProperty({ enum: GoErrorCode, enumName: 'GoErrorCode', example: GoErrorCode.VALIDATION_ERROR })
  code: GoErrorCode;

  @ApiProperty({ example: 'Validation failed' })
  message: string;

  @ApiPropertyOptional({ type: [FieldErrorDto], description: 'Only for VALIDATION_ERROR' })
  errors?: FieldErrorDto[];

  @ApiProperty({ example: '/api/v1/go/auth/otp/request' })
  path: string;

  @ApiProperty({ example: '2026-10-04T10:00:00.000Z' })
  timestamp: string;

  @ApiProperty({ example: '6f1c1e9e-2f7c-4d43-9a39-3c1f2b0d7a11' })
  request_id: string;
}
