import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  IsArray,
  IsInt,
  IsOptional,
  IsUUID,
  Max,
  Min,
  ValidateNested,
} from "class-validator";

export class PreviewQuoteItemDto {
  @ApiProperty()
  @IsUUID()
  variantId!: string;

  @ApiProperty({ minimum: 1, maximum: 20 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(20)
  quantity!: number;
}

export class PreviewQuoteShopDto {
  @ApiProperty()
  @IsUUID()
  shopId!: string;

  @ApiProperty({ type: [PreviewQuoteItemDto] })
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => PreviewQuoteItemDto)
  items!: PreviewQuoteItemDto[];
}

export class PreviewQuoteDto {
  @ApiProperty()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  districtId!: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  thanaId?: string;

  @ApiProperty({ type: [PreviewQuoteShopDto] })
  @IsArray()
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => PreviewQuoteShopDto)
  shops!: PreviewQuoteShopDto[];
}
