import { applyDecorators, type Type } from "@nestjs/common";
import { ApiExtraModels, ApiProperty, ApiPropertyOptional, ApiResponse, getSchemaPath } from "@nestjs/swagger";

export class PaginationMetaDto {
  @ApiProperty() page!: number;
  @ApiProperty() limit!: number;
  @ApiProperty() total!: number;
  @ApiProperty() totalPages!: number;
}

export class ErrorBodyDto {
  @ApiProperty({ example: "INSUFFICIENT_STOCK" }) code!: string;
  @ApiProperty() message!: string;
  @ApiPropertyOptional() details?: unknown;
}

export class ErrorEnvelopeDto {
  @ApiProperty({ example: false }) success!: boolean;
  @ApiProperty({ example: 422 }) statusCode!: number;
  @ApiProperty({ type: ErrorBodyDto }) error!: ErrorBodyDto;
  @ApiProperty({ example: "/api/v1/checkout" }) path!: string;
  @ApiProperty() timestamp!: string;
}

/** `{ success: true, data: <model> }` */
export function ApiEnvelopeResponse<TModel extends Type<unknown>>(
  model: TModel,
  options: { status?: number; description?: string } = {},
) {
  return applyDecorators(
    ApiExtraModels(model),
    ApiResponse({
      status: options.status ?? 200,
      description: options.description,
      schema: {
        type: "object",
        required: ["success", "data"],
        properties: {
          success: { type: "boolean", example: true },
          data: { $ref: getSchemaPath(model) },
        },
      },
    }),
  );
}

/** `{ success: true, data: [<model>] }` (no meta) */
export function ApiEnvelopeArrayResponse<TModel extends Type<unknown>>(
  model: TModel,
  options: { status?: number; description?: string } = {},
) {
  return applyDecorators(
    ApiExtraModels(model),
    ApiResponse({
      status: options.status ?? 200,
      description: options.description,
      schema: {
        type: "object",
        required: ["success", "data"],
        properties: {
          success: { type: "boolean", example: true },
          data: { type: "array", items: { $ref: getSchemaPath(model) } },
        },
      },
    }),
  );
}

/** `{ success: true, data: [<model>], meta }` */
export function ApiPaginatedResponse<TModel extends Type<unknown>>(
  model: TModel,
  options: { description?: string } = {},
) {
  return applyDecorators(
    ApiExtraModels(model, PaginationMetaDto),
    ApiResponse({
      status: 200,
      description: options.description,
      schema: {
        type: "object",
        required: ["success", "data", "meta"],
        properties: {
          success: { type: "boolean", example: true },
          data: { type: "array", items: { $ref: getSchemaPath(model) } },
          meta: { $ref: getSchemaPath(PaginationMetaDto) },
        },
      },
    }),
  );
}

/** Documents the common error envelope for the given status codes. */
export function ApiErrorResponses(statuses: number[] = [400, 401, 403, 404, 422, 429]) {
  return applyDecorators(
    ApiExtraModels(ErrorEnvelopeDto),
    ...statuses.map((status) =>
      ApiResponse({ status, schema: { $ref: getSchemaPath(ErrorEnvelopeDto) } }),
    ),
  );
}
