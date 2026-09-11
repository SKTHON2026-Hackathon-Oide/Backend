import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsPositive,
  Max,
  Min,
} from 'class-validator';
import { SpaceDetailSource } from '../../../domain/enums/space-detail-source.enum';
import type {
  ParkingAvailability,
  StreetVisibility,
  WalkAccess,
} from '../../../domain/enums/space-detail-source.enum';

export class SelectSpaceDetailDto {
  @ApiProperty({ enum: SpaceDetailSource })
  @IsEnum(SpaceDetailSource)
  source: SpaceDetailSource;

  @ApiPropertyOptional({ example: 'opt_abc123' })
  @IsOptional()
  optionId?: string;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(-10)
  @Max(100)
  floor?: number;

  @ApiPropertyOptional({ example: 59.72 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  exclusiveAreaSqm?: number;

  @ApiPropertyOptional({ example: 30000000 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  depositKrw?: number;

  @ApiPropertyOptional({ example: 2500000 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  monthlyRentKrw?: number;

  @ApiPropertyOptional({ example: 300000 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  maintenanceFeeKrw?: number;

  @ApiPropertyOptional({ enum: ['AVAILABLE', 'UNAVAILABLE', 'UNKNOWN'] })
  @IsOptional()
  @IsEnum(['AVAILABLE', 'UNAVAILABLE', 'UNKNOWN'])
  parking?: ParkingAvailability;

  @ApiPropertyOptional({ enum: ['HIGH', 'MEDIUM', 'LOW', 'UNKNOWN'] })
  @IsOptional()
  @IsEnum(['HIGH', 'MEDIUM', 'LOW', 'UNKNOWN'])
  streetVisibility?: StreetVisibility;

  @ApiPropertyOptional({ enum: ['GOOD', 'NORMAL', 'POOR', 'UNKNOWN'] })
  @IsOptional()
  @IsEnum(['GOOD', 'NORMAL', 'POOR', 'UNKNOWN'])
  walkAccess?: WalkAccess;
}
