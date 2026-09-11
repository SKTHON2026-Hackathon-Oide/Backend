import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdministrativeArea } from './infrastructure/persistence/typeorm/entities/administrative-area.entity';
import { AdministrativeAreaController } from './interfaces/http/administrative-area.controller';
import { ResolveAdministrativeAreaService } from './applications/resolve-administrative-area.service';

@Module({
  imports: [TypeOrmModule.forFeature([AdministrativeArea])],
  controllers: [AdministrativeAreaController],
  providers: [ResolveAdministrativeAreaService],
  exports: [TypeOrmModule, ResolveAdministrativeAreaService],
})
export class AdministrativeAreasModule {}
