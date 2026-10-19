import { ApiProperty } from "@nestjs/swagger";

import { CityScope } from "../../../generated/prisma/enums";
import { DistrictDto } from "../../locations/dto/district.dto";

export class AddressDto {
  @ApiProperty() id!: string;
  @ApiProperty({ nullable: true, type: String }) label!: string | null;
  @ApiProperty() recipientName!: string;
  @ApiProperty() phone!: string;
  @ApiProperty() districtId!: number;
  @ApiProperty({ type: DistrictDto }) district!: DistrictDto;
  @ApiProperty() area!: string;
  @ApiProperty() addressLine!: string;
  @ApiProperty({ nullable: true, type: String }) postalCode!: string | null;
  @ApiProperty({ enum: Object.values(CityScope) }) cityScope!: CityScope;
  @ApiProperty() isDefault!: boolean;
  @ApiProperty({ type: String, format: "date-time" }) createdAt!: string;
}
