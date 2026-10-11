import { ApiProperty } from "@nestjs/swagger";

export class CategoryNodeDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiProperty({ nullable: true, type: String }) nameBn!: string | null;
  @ApiProperty() slug!: string;
  @ApiProperty({ nullable: true, type: String }) imageUrl!: string | null;
  @ApiProperty({ nullable: true, type: String }) parentId!: string | null;
  @ApiProperty() sortOrder!: number;
  @ApiProperty({
    description: "Visible, in-stock products; child categories are counted into the parent",
  })
  productCount!: number;
  @ApiProperty({ type: () => [CategoryNodeDto] }) children!: CategoryNodeDto[];
}
