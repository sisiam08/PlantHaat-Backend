import { ApiProperty } from "@nestjs/swagger";

export class DistrictDto {
  @ApiProperty() id!: number;
  @ApiProperty() name!: string;
  @ApiProperty() nameBn!: string;
  @ApiProperty() division!: string;
}
