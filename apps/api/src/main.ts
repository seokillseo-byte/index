import 'reflect-metadata';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  const config = app.get(ConfigService);
  const port = config.get<number>('PORT', 4000);
  const origins = (config.get<string>('CORS_ORIGINS') ?? 'https://index-assist.io.vn')
    .split(',').map((value) => value.trim()).filter(Boolean);

  app.setGlobalPrefix('api/v1');
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'same-site' } }));
  app.enableCors({ origin: origins, credentials: true, methods: ['GET','POST','PUT','PATCH','DELETE','OPTIONS'] });
  app.useGlobalPipes(new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    transformOptions: { enableImplicitConversion: false },
  }));
  app.enableShutdownHooks();

  if (config.get<string>('OPENAPI_ENABLED') === 'true') {
    const document = SwaggerModule.createDocument(app, new DocumentBuilder()
      .setTitle('Index Assist API')
      .setDescription('Versioned API for Index Assist')
      .setVersion('1.0')
      .addBearerAuth()
      .build());
    SwaggerModule.setup('api/docs', app, document);
  }

  await app.listen(port, '0.0.0.0');
}
void bootstrap();
