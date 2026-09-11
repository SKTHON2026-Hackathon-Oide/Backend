import { IsObject, IsOptional } from 'class-validator';

export class CreateRecommendationRequestDto {
  @IsOptional()
  @IsObject()
  userPreference?: Record<string, unknown>;
}
