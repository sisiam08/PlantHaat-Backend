import type { CityScope } from "../../generated/prisma/enums";

export interface AddressDistrictView {
  id: number;
  name: string;
  nameBn: string;
  division: string;
}

export interface AddressSource {
  id: string;
  label: string | null;
  recipientName: string;
  phone: string;
  districtId: number;
  area: string;
  addressLine: string;
  postalCode: string | null;
  cityScope: CityScope;
  isDefault: boolean;
  createdAt: Date;
  district: AddressDistrictView;
}

export interface AddressView {
  id: string;
  label: string | null;
  recipientName: string;
  phone: string;
  districtId: number;
  district: AddressDistrictView;
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
    area: address.area,
    addressLine: address.addressLine,
    postalCode: address.postalCode,
    cityScope: address.cityScope,
    isDefault: address.isDefault,
    createdAt: address.createdAt,
  };
}
