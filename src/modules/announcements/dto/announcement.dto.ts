import { ApiProperty, ApiPropertyOptional, PartialType } from "@nestjs/swagger";
import { IsEnum, IsISO8601, IsOptional, IsString, MaxLength, MinLength } from "class-validator";

import { PaginationQueryDto } from "../../../common/dto/pagination-query.dto";
import { AnnouncementAudience } from "../../../generated/prisma/enums";

export class CreateAnnouncementDto {
  @ApiProperty()
  @IsString()
  @MinLength(2)
  @MaxLength(150)
  title!: string;

  @ApiProperty()
  @IsString()
  @MinLength(2)
  @MaxLength(5000)
  body!: string;

  @ApiPropertyOptional({ enum: AnnouncementAudience, default: AnnouncementAudience.ALL })
  @IsOptional()
  @IsEnum(AnnouncementAudience)
  audience?: AnnouncementAudience;

  @ApiPropertyOptional()
  @IsOptional()
  @IsISO8601()
  publishedAt?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsISO8601()
  expiresAt?: string;
}

export class UpdateAnnouncementDto extends PartialType(CreateAnnouncementDto) {}

export class QueryAnnouncementsDto extends PaginationQueryDto {}
