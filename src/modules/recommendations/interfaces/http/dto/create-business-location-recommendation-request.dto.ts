import { Type } from 'class-transformer';
import {
  IsLatitude,
  IsLongitude,
  IsNotEmpty,
  IsString,
  Matches,
  ValidateNested,
} from 'class-validator';

export class PreferredLocationDto {
  @Type(() => Number)
  @IsLongitude()
  longitude: number;

  @Type(() => Number)
  @IsLatitude()
  latitude: number;
}

export class OperatingHoursDto {
  @IsString()
  @Matches(/^([01]\d|2[0-3]):(00|15|30|45)$/)
  opensAt: string;

  @IsString()
  @Matches(/^([01]\d|2[0-3]):(00|15|30|45)$/)
  closesAt: string;
}

export class CreateBusinessLocationRecommendationRequestDto {
  @IsString()
  @IsNotEmpty()
  businessCategoryCode: string;

  @ValidateNested()
  @Type(() => PreferredLocationDto)
  preferredLocation: PreferredLocationDto;

  @ValidateNested()
  @Type(() => OperatingHoursDto)
  operatingHours: OperatingHoursDto;
}
