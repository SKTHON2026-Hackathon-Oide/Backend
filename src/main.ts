import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Reflector } from '@nestjs/core';
import { clerkMiddleware } from '@clerk/express';
import { AppModule } from './app.module';
import { ResponseInterceptor } from './modules/common/interceptors/response.interceptor';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  // 3MB report plus JSON metadata; exact report size is checked by the service.
  app.useBodyParser('json', { limit: '4mb' });

  const authorizedParties = (process.env.CLERK_AUTHORIZED_PARTIES ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  const clerkConfigured = Boolean(
    process.env.CLERK_PUBLISHABLE_KEY &&
    (process.env.CLERK_SECRET_KEY || process.env.CLERK_JWT_KEY),
  );
  if (clerkConfigured) {
    app.use(
      clerkMiddleware({
        publishableKey: process.env.CLERK_PUBLISHABLE_KEY,
        secretKey: process.env.CLERK_SECRET_KEY,
        jwtKey: process.env.CLERK_JWT_KEY,
        authorizedParties: authorizedParties.length
          ? authorizedParties
          : undefined,
      }),
    );
  }

  app.setGlobalPrefix('api');
  app.enableCors({
    origin: authorizedParties.length ? authorizedParties : true,
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'Accept',
      'Idempotency-Key',
      'Last-Event-Id',
    ],
  });
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    }),
  );
  app.useGlobalInterceptors(new ResponseInterceptor(app.get(Reflector)));

  const swaggerConfig = new DocumentBuilder()
    .setTitle('SKTHON API')
    .setDescription('서울시 상권·건물 기반 창업 입지 추천 API')
    .setVersion('0.1.0')
    .build();
  const swaggerDocument = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('docs', app, swaggerDocument);

  await app.listen(Number(process.env.PORT ?? 3000));
}

void bootstrap();
