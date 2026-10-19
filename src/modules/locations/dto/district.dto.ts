import { ApiProperty } from "@nestjs/swagger";

export class DistrictDto {
  @ApiProperty() id!: number;
  @ApiProperty() name!: string;
  @ApiProperty() nameBn!: string;
  @ApiProperty() division!: string;
  @ApiProperty({ description: "Metro district (city/outside scope applies)" }) metro!: boolean;
}
