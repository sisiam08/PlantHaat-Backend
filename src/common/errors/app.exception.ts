import { HttpException, HttpStatus } from "@nestjs/common";

import { ErrorCode, type ErrorCode as ErrorCodeType } from "./error-codes";

export interface AppExceptionOptions {
  code: string;
  message: string;
  status?: number;
  details?: unknown;
}

export class AppException extends HttpException {
  readonly code: string;
  readonly details?: unknown;
  readonly appMessage: string;

  constructor({ code, message, status = HttpStatus.BAD_REQUEST, details }: AppExceptionOptions) {
    super({ code, message, details }, status);
    this.code = code;
    this.details = details;
    this.appMessage = message;
  }

  static badRequest(code: ErrorCodeType, message: string, details?: unknown): AppException {
    return new AppException({ code, message, status: HttpStatus.BAD_REQUEST, details });
  }

  static unauthorized(code: ErrorCodeType, message: string, details?: unknown): AppException {
    return new AppException({ code, message, status: HttpStatus.UNAUTHORIZED, details });
  }

  static forbidden(code: ErrorCodeType, message: string, details?: unknown): AppException {
    return new AppException({ code, message, status: HttpStatus.FORBIDDEN, details });
  }

  static notFound(code: ErrorCodeType, message: string, details?: unknown): AppException {
    return new AppException({ code, message, status: HttpStatus.NOT_FOUND, details });
  }

  static conflict(code: ErrorCodeType, message: string, details?: unknown): AppException {
    return new AppException({ code, message, status: HttpStatus.CONFLICT, details });
  }

  static unprocessable(code: ErrorCodeType, message: string, details?: unknown): AppException {
    return new AppException({ code, message, status: HttpStatus.UNPROCESSABLE_ENTITY, details });
  }

  static locked(code: ErrorCodeType, message: string, details?: unknown): AppException {
    return new AppException({ code, message, status: HttpStatus.LOCKED, details });
  }

  static internal(message = "Unexpected error", details?: unknown): AppException {
    return new AppException({
      code: ErrorCode.INTERNAL_ERROR,
      message,
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      details,
    });
  }
}
