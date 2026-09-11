import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
} from 'class-validator';

export class SelectAnalysisBuildingDto {
  @ApiProperty({ example: '12345', description: '내부 building.id' })
  @IsString()
  @Matches(/^[1-9]\d*$/)
  buildingId: string;

  @ApiProperty({ required: false, default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  spaceOptionsPage?: number;

  @ApiProperty({ required: false, default: 100, minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  spaceOptionsPageSize?: number;
}
