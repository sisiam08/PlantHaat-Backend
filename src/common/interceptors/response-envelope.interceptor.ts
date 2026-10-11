import {
  type CallHandler,
  type ExecutionContext,
  Injectable,
  type NestInterceptor,
} from "@nestjs/common";
import { map, type Observable } from "rxjs";

import { isCursorPaginatedResult, isPaginatedResult } from "../types/paginated";

export interface SuccessEnvelope<T> {
  success: true;
  data: T;
  meta?: unknown;
}

@Injectable()
export class ResponseEnvelopeInterceptor implements NestInterceptor {
  intercept(_context: ExecutionContext, next: CallHandler): Observable<unknown> {
    return next.handle().pipe(
      map((payload: unknown): SuccessEnvelope<unknown> => {
        if (isPaginatedResult(payload) || isCursorPaginatedResult(payload)) {
          return { success: true, data: payload.data, meta: payload.meta };
        }
        return { success: true, data: payload === undefined ? null : payload };
      }),
    );
  }
}
