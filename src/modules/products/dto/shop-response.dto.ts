import { ApiProperty } from "@nestjs/swagger";

export class ShopListItemDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiProperty() slug!: string;
  @ApiProperty({ nullable: true, type: String }) logoUrl!: string | null;
  @ApiProperty({ nullable: true, type: String }) district!: string | null;
  @ApiProperty({ type: String, description: "Decimal as string" }) ratingAvg!: string;
  @ApiProperty() ratingCount!: number;
  @ApiProperty() isOnVacation!: boolean;
  @ApiProperty() productCount!: number;
}

export class ShopDetailDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiProperty() slug!: string;
  @ApiProperty({ nullable: true, type: String }) description!: string | null;
  @ApiProperty({ nullable: true, type: String }) logoUrl!: string | null;
  @ApiProperty({ nullable: true, type: String }) bannerUrl!: string | null;
  @ApiProperty({ nullable: true, type: String }) phone!: string | null;
  @ApiProperty({ nullable: true, type: String }) district!: string | null;
  @ApiProperty({ nullable: true, type: String }) address!: string | null;
  @ApiProperty({ type: String, description: "Decimal as string" }) ratingAvg!: string;
  @ApiProperty() ratingCount!: number;
  @ApiProperty() isOnVacation!: boolean;
  @ApiProperty({ nullable: true, type: String }) vacationMessage!: string | null;
  @ApiProperty({ type: String, format: "date-time" }) createdAt!: string;
}
