import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppController } from './app.controller';
import { AnalyticsModule } from './modules/analytics/analytics.module';
import { AdministrativeAreasModule } from './modules/administrative-areas/administrative-areas.module';
import { AuthModule } from './modules/auth/auth.module';
import { BuildingsModule } from './modules/buildings/buildings.module';
import { CommercialAreasModule } from './modules/commercial-areas/commercial-areas.module';
import { CommonModule } from './modules/common/common.module';
import { HealthModule } from './modules/health/health.module';
import { RecommendationsModule } from './modules/recommendations/recommendations.module';
import { StoresModule } from './modules/stores/stores.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      envFilePath: ['.env', 'infra/databases/.env'],
    }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres' as const,
        host: config.get<string>('DB_HOST', 'localhost'),
        port: Number(config.get<string>('DB_PORT') ?? 5432),
        username: config.get<string>('DB_USERNAME', 'skthon'),
        password: config.get<string>('DB_PASSWORD', ''),
        database: config.get<string>('DB_DATABASE', 'skthon'),
        autoLoadEntities: true,
        synchronize: false,
        migrationsRun: false,
        migrations: [__dirname + '/database/migrations/*{.ts,.js}'],
        logging: config.get<string>('DB_LOGGING', 'false') === 'true',
        ssl:
          config.get<string>('DB_SSL', 'false') === 'true'
            ? { rejectUnauthorized: false }
            : undefined,
        extra: { timezone: '+09:00' },
      }),
    }),
    CommonModule,
    HealthModule,
    AuthModule,
    AdministrativeAreasModule,
    BuildingsModule,
    CommercialAreasModule,
    StoresModule,
    AnalyticsModule,
    RecommendationsModule,
  ],
  controllers: [AppController],
})
export class AppModule {}
