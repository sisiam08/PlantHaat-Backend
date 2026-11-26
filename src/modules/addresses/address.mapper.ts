import type { CityScope, DhakaZone } from "../../generated/prisma/enums";

export interface AddressDistrictView {
  id: number;
  name: string;
  nameBn: string;
  division: string;
}

export interface AddressThanaView {
  id: string;
  name: string;
  nameBn: string | null;
  dhakaZone: DhakaZone | null;
}

export interface AddressSource {
  id: string;
  label: string | null;
  recipientName: string;
  phone: string;
  districtId: number;
  thanaId: string | null;
  area: string;
  addressLine: string;
  postalCode: string | null;
  cityScope: CityScope;
  isDefault: boolean;
  createdAt: Date;
  district: AddressDistrictView;
  thana: AddressThanaView | null;
}

export interface AddressView {
  id: string;
  label: string | null;
  recipientName: string;
  phone: string;
  districtId: number;
  district: AddressDistrictView;
  thanaId: string | null;
  thana: AddressThanaView | null;
  area: string;
  addressLine: string;
  postalCode: string | null;
  cityScope: CityScope;
  isDefault: boolean;
  createdAt: Date;
}

export function toAddressView(address: AddressSource): AddressView {
  return {
    id: address.id,
    label: address.label,
    recipientName: address.recipientName,
    phone: address.phone,
    districtId: address.districtId,
    district: address.district,
    thanaId: address.thanaId,
    thana: address.thana,
    area: address.area,
    addressLine: address.addressLine,
    postalCode: address.postalCode,
    cityScope: address.cityScope,
    isDefault: address.isDefault,
    createdAt: address.createdAt,
  };
}
