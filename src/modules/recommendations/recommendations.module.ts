import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RecommendationRequest } from './infrastructure/persistence/typeorm/entities/recommendation-request.entity';
import { RecommendationResult } from './infrastructure/persistence/typeorm/entities/recommendation-result.entity';

@Module({
  imports: [TypeOrmModule.forFeature([RecommendationRequest, RecommendationResult])],
  exports: [TypeOrmModule],
})
export class RecommendationsModule {}
