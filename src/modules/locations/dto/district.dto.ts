import { ApiProperty } from "@nestjs/swagger";

import { DhakaZone } from "../../../generated/prisma/enums";

export class DistrictDto {
  @ApiProperty() id!: number;
  @ApiProperty() name!: string;
  @ApiProperty() nameBn!: string;
  @ApiProperty() division!: string;
  @ApiProperty({ description: "Metro district (city/outside scope applies)" }) metro!: boolean;
  @ApiProperty({ description: "Legacy inside-Dhaka pricing flag" }) insideDhaka!: boolean;
  @ApiProperty({ description: "A thana must be chosen for this district" })
  requiresThana!: boolean;
}

export class ThanaDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiProperty({ nullable: true, type: String }) nameBn!: string | null;
  @ApiProperty() districtId!: number;
  @ApiProperty({ enum: Object.values(DhakaZone), nullable: true })
  dhakaZone!: DhakaZone | null;
  @ApiProperty({ description: "Can be offered as an address-level thana" })
  selectableByCustomer!: boolean;
}

