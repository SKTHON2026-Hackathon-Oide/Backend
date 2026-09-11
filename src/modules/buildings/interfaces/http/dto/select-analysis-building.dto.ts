import { ApiProperty } from '@nestjs/swagger';
import { IsString, Matches } from 'class-validator';

export class SelectAnalysisBuildingDto {
  @ApiProperty({ example: '12345', description: '내부 building.id' })
  @IsString()
  @Matches(/^[1-9]\d*$/)
  buildingId: string;
}
