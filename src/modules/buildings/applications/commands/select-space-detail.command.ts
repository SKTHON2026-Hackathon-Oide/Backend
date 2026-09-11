import {
  ParkingAvailability,
  SpaceDetailSource,
  StreetVisibility,
  WalkAccess,
} from '../../domain/enums/space-detail-source.enum';

export interface SelectSpaceDetailCommand {
  userId: string;
  contextId: string;
  source: SpaceDetailSource;
  optionId?: string;
  floor?: number;
  exclusiveAreaSqm?: number;
  depositKrw?: number;
  monthlyRentKrw?: number;
  maintenanceFeeKrw?: number;
  parking?: ParkingAvailability;
  streetVisibility?: StreetVisibility;
  walkAccess?: WalkAccess;
}
