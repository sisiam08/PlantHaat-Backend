import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  MinLength,
} from "class-validator";

import { PaginationQueryDto } from "../../../common/dto/pagination-query.dto";
import { ComplaintStatus, ComplaintType } from "../../../generated/prisma/enums";

export class CreateComplaintDto {
  @ApiProperty()
  @IsUUID()
  shopOrderId!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  orderItemId?: string;

  @ApiProperty({ enum: ComplaintType })
  @IsEnum(ComplaintType)
  type!: ComplaintType;

  @ApiProperty()
  @IsString()
  @MinLength(10)
  @MaxLength(2000)
  description!: string;

  @ApiPropertyOptional({ type: [String], maxItems: 5 })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(5)
  @IsString({ each: true })
  @MaxLength(500, { each: true })
  attachments?: string[];
}

export class ComplaintCommentDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  body!: string;

  @ApiPropertyOptional({ description: "Admin-only internal note" })
  @IsOptional()
  @IsBoolean()
  isInternal?: boolean;
}

export class UpdateComplaintStatusDto {
  @ApiProperty({ enum: ComplaintStatus })
  @IsEnum(ComplaintStatus)
  status!: ComplaintStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  resolutionNote?: string;
}

export class ResolveComplaintDto {
  @ApiProperty({ enum: ComplaintStatus })
  @IsEnum(ComplaintStatus)
  status!: ComplaintStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  resolutionNote?: string;

  @ApiPropertyOptional({ example: 1000 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  refundAmount?: number;
}

export class QueryComplaintsDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: ComplaintStatus })
  @IsOptional()
  @IsEnum(ComplaintStatus)
  status?: ComplaintStatus;
}

export class DecideDisputeDto {
  @ApiProperty({
    enum: ["REJECTED", "REFUND_FULL", "REFUND_PARTIAL", "RETURN_TO_SELLER"],
  })
  @IsIn(["REJECTED", "REFUND_FULL", "REFUND_PARTIAL", "RETURN_TO_SELLER"])
  decision!: "REJECTED" | "REFUND_FULL" | "REFUND_PARTIAL" | "RETURN_TO_SELLER";

  @ApiProperty()
  @IsString()
  @MinLength(3)
  @MaxLength(2000)
  reason!: string;

  @ApiPropertyOptional({ example: 500 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  refundAmount?: number;

  @ApiPropertyOptional({ example: "BKASHREF1234" })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  refundTrxId?: string;
}
