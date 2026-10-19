import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Transform, Type } from "class-transformer";
import {
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from "class-validator";

import { PaginationQueryDto } from "../../../common/dto/pagination-query.dto";
import { stripHtml } from "../../../common/utils/text";
import { ContentReportTargetType } from "../../../generated/prisma/enums";

const strip = ({ value }: { value: unknown }): unknown =>
  typeof value === "string" ? stripHtml(value) : value;

/** Cursor list query shared by Q&A and review lists. */
export class CursorQueryDto {
  @ApiPropertyOptional({ description: "Opaque cursor from the previous page" })
  @IsOptional()
  @IsString()
  @MaxLength(512)
  cursor?: string;

  @ApiPropertyOptional({ default: 20, maximum: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number = 20;
}

export class CreateQuestionDto {
  @ApiProperty({ minLength: 10, maxLength: 1000 })
  @Transform(strip)
  @IsString()
  @MinLength(10)
  @MaxLength(1000)
  body!: string;
}

export class UpdateQuestionDto {
  @ApiProperty({ minLength: 10, maxLength: 1000 })
  @Transform(strip)
  @IsString()
  @MinLength(10)
  @MaxLength(1000)
  body!: string;
}

export class CreateBodyDto {
  @ApiProperty({ minLength: 1, maxLength: 2000 })
  @Transform(strip)
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  body!: string;
}

export class UpdateBodyDto {
  @ApiProperty({ minLength: 1, maxLength: 2000 })
  @Transform(strip)
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  body!: string;
}

export class ReportContentDto {
  @ApiProperty({ minLength: 3, maxLength: 500 })
  @Transform(strip)
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason!: string;
}

export class QuerySellerQuestionsDto extends CursorQueryDto {
  @ApiPropertyOptional({ enum: ["unanswered", "all"], default: "all" })
  @IsOptional()
  @IsIn(["unanswered", "all"])
  status?: "unanswered" | "all" = "all";
}

export class QueryContentReportsDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: ["OPEN", "RESOLVED_HIDDEN", "RESOLVED_KEPT"] })
  @IsOptional()
  @IsIn(["OPEN", "RESOLVED_HIDDEN", "RESOLVED_KEPT"])
  status?: "OPEN" | "RESOLVED_HIDDEN" | "RESOLVED_KEPT";

  @ApiPropertyOptional({ enum: Object.values(ContentReportTargetType) })
  @IsOptional()
  @IsEnum(ContentReportTargetType)
  targetType?: ContentReportTargetType;
}

export class ResolveContentReportDto {
  @ApiProperty({ description: "true hides the reported content, false keeps it" })
  @IsBoolean()
  hide!: boolean;
}
