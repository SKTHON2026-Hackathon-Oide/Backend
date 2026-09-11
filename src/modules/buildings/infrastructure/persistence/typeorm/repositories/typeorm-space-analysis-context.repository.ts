import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SpaceAnalysisContextRepository } from '../../../../domain/ports/space-analysis-context.repository.port';
import { SpaceAnalysisContext } from '../entities/space-analysis-context.entity';

@Injectable()
export class TypeOrmSpaceAnalysisContextRepository implements SpaceAnalysisContextRepository {
  constructor(
    @InjectRepository(SpaceAnalysisContext)
    private readonly repository: Repository<SpaceAnalysisContext>,
  ) {}

  create(context: SpaceAnalysisContext): Promise<SpaceAnalysisContext> {
    return this.repository.save(context);
  }

  findOwnedById(
    contextId: string,
    userId: string,
  ): Promise<SpaceAnalysisContext | null> {
    return this.repository.findOne({
      where: { id: contextId, userId },
    });
  }

  save(context: SpaceAnalysisContext): Promise<SpaceAnalysisContext> {
    return this.repository.save(context);
  }
}
