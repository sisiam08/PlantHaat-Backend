import { ApiProperty } from "@nestjs/swagger";

import { CityScope, DhakaZone } from "../../../generated/prisma/enums";
import { DistrictDto } from "../../locations/dto/district.dto";

export class AddressThanaDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiProperty({ nullable: true, type: String }) nameBn!: string | null;
  @ApiProperty({ enum: Object.values(DhakaZone), nullable: true })
  dhakaZone!: DhakaZone | null;
}

export class AddressDto {
  @ApiProperty() id!: string;
  @ApiProperty({ nullable: true, type: String }) label!: string | null;
  @ApiProperty() recipientName!: string;
  @ApiProperty() phone!: string;
  @ApiProperty() districtId!: number;
  @ApiProperty({ type: DistrictDto }) district!: DistrictDto;
  @ApiProperty({ nullable: true, type: String }) thanaId!: string | null;
  @ApiProperty({ type: AddressThanaDto, nullable: true })
  thana!: AddressThanaDto | null;
  @ApiProperty() area!: string;
  @ApiProperty() addressLine!: string;
  @ApiProperty({ nullable: true, type: String }) postalCode!: string | null;
  @ApiProperty({ enum: Object.values(CityScope) }) cityScope!: CityScope;
  @ApiProperty() isDefault!: boolean;
  @ApiProperty({ type: String, format: "date-time" }) createdAt!: string;
}
