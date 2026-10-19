import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsBoolean, IsEnum, IsOptional, IsString, MaxLength } from "class-validator";

import { PaginationQueryDto } from "../../../common/dto/pagination-query.dto";
import { CodRiskStatus } from "../../../generated/prisma/enums";

export class QueryCodRiskDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: CodRiskStatus })
  @IsOptional()
  @IsEnum(CodRiskStatus)
  status?: CodRiskStatus;

  @ApiPropertyOptional({ description: "Phone contains" })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  q?: string;
}

export class SetCodRiskStatusDto {
  @ApiProperty({ enum: CodRiskStatus })
  @IsEnum(CodRiskStatus)
  status!: CodRiskStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class SetCodRiskWhitelistDto {
  @ApiProperty()
  @IsBoolean()
  whitelisted!: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
