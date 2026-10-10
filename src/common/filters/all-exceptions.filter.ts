import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from "@nestjs/common";
import type { Request, Response } from "express";
import { ZodError } from "zod";

import { AppConfigService } from "../../config/app-config.service";
import { Prisma } from "../../generated/prisma/client";
import { AppException } from "../errors/app.exception";
import { ErrorCode } from "../errors/error-codes";

interface ResolvedError {
  status: number;
  code: string;
  message: string;
  details?: unknown;
}

interface ErrorResponseBody {
  success: false;
  statusCode: number;
  error: { code: string; message: string; details?: unknown };
  path: string;
  timestamp: string;
}

const STATUS_DEFAULT_CODE: Record<number, string> = {
  [HttpStatus.BAD_REQUEST]: ErrorCode.BAD_REQUEST,
  [HttpStatus.UNAUTHORIZED]: ErrorCode.UNAUTHENTICATED,
  [HttpStatus.FORBIDDEN]: ErrorCode.FORBIDDEN,
  [HttpStatus.NOT_FOUND]: ErrorCode.NOT_FOUND,
  [HttpStatus.CONFLICT]: ErrorCode.CONFLICT,
  [HttpStatus.UNPROCESSABLE_ENTITY]: ErrorCode.UNPROCESSABLE_ENTITY,
  [HttpStatus.TOO_MANY_REQUESTS]: ErrorCode.TOO_MANY_REQUESTS,
  [HttpStatus.INTERNAL_SERVER_ERROR]: ErrorCode.INTERNAL_ERROR,
};

const STATUS_DEFAULT_MESSAGE: Record<number, string> = {
  [HttpStatus.BAD_REQUEST]: "Bad request",
  [HttpStatus.UNAUTHORIZED]: "Authentication required",
  [HttpStatus.FORBIDDEN]: "You are not allowed to perform this action",
  [HttpStatus.NOT_FOUND]: "Resource not found",
  [HttpStatus.CONFLICT]: "Resource conflict",
  [HttpStatus.UNPROCESSABLE_ENTITY]: "Request could not be processed",
  [HttpStatus.TOO_MANY_REQUESTS]: "Too many requests",
  [HttpStatus.INTERNAL_SERVER_ERROR]: "Internal server error",
};

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  constructor(private readonly config: AppConfigService) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const resolved = this.resolve(exception);

    if (resolved.status >= 500) {
      const stack = exception instanceof Error ? exception.stack : undefined;
      this.logger.error(
        `${request.method} ${request.url} -> ${resolved.status} ${resolved.code}`,
        stack,
      );
    } else {
      this.logger.debug(`${request.method} ${request.url} -> ${resolved.status} ${resolved.code}`);
    }

    const body: ErrorResponseBody = {
      success: false,
      statusCode: resolved.status,
      error: {
        code: resolved.code,
        message: resolved.message,
        ...(resolved.details === undefined ? {} : { details: resolved.details }),
      },
      path: request.url,
      timestamp: new Date().toISOString(),
    };

    response.status(resolved.status).json(body);
  }

  private resolve(exception: unknown): ResolvedError {
    if (exception instanceof AppException) {
      return {
        status: exception.getStatus(),
        code: exception.code,
        message: exception.appMessage,
        details: exception.details,
      };
    }

    if (exception instanceof ZodError) {
      return {
        status: HttpStatus.BAD_REQUEST,
        code: ErrorCode.VALIDATION_FAILED,
        message: "Validation failed",
        details: exception.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message,
        })),
      };
    }

    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      return this.resolvePrismaError(exception);
    }

    if (exception instanceof Prisma.PrismaClientValidationError) {
      return {
        status: HttpStatus.BAD_REQUEST,
        code: ErrorCode.VALIDATION_FAILED,
        message: "Invalid database request",
      };
    }

    if (exception instanceof HttpException) {
      return this.resolveHttpException(exception);
    }

    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      code: ErrorCode.INTERNAL_ERROR,
      message:
        this.config.isProduction || !(exception instanceof Error)
          ? STATUS_DEFAULT_MESSAGE[HttpStatus.INTERNAL_SERVER_ERROR]
          : exception.message,
    };
  }

  private resolveHttpException(exception: HttpException): ResolvedError {
    const status = exception.getStatus();
    const response = exception.getResponse();

    if (typeof response === "string") {
      return { status, code: this.defaultCode(status), message: response };
    }

    const body = response as {
      message?: string | string[];
      error?: string;
      code?: string;
      details?: unknown;
    };

    if (Array.isArray(body.message)) {
      return {
        status,
        code: ErrorCode.VALIDATION_FAILED,
        message: "Validation failed",
        details: body.message,
      };
    }

    return {
      status,
      code: typeof body.code === "string" ? body.code : this.defaultCode(status),
      message:
        typeof body.message === "string"
          ? body.message
          : (body.error ?? this.defaultMessage(status)),
      details: body.details,
    };
  }

  private resolvePrismaError(exception: Prisma.PrismaClientKnownRequestError): ResolvedError {
    switch (exception.code) {
      case "P2002":
        return {
          status: HttpStatus.CONFLICT,
          code: ErrorCode.CONFLICT,
          message: "A record with the same unique value already exists",
          details: exception.meta,
        };
      case "P2025":
        return {
          status: HttpStatus.NOT_FOUND,
          code: ErrorCode.NOT_FOUND,
          message: "Resource not found",
        };
      case "P2003":
        return {
          status: HttpStatus.BAD_REQUEST,
          code: ErrorCode.BAD_REQUEST,
          message: "Invalid reference to a related record",
          details: exception.meta,
        };
      default:
        return {
          status: HttpStatus.BAD_REQUEST,
          code: ErrorCode.BAD_REQUEST,
          message: "Database request failed",
        };
    }
  }

  private defaultCode(status: number): string {
    return STATUS_DEFAULT_CODE[status] ?? `HTTP_${status}`;
  }

  private defaultMessage(status: number): string {
    return STATUS_DEFAULT_MESSAGE[status] ?? "Request failed";
  }
}
