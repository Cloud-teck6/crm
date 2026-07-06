import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import pinoHttp from 'pino-http';
import { AppModule } from './app.module';

async function bootstrap() {
  // rawBody: true exposes req.rawBody (Buffer) for webhook signature checks.
  const app = await NestFactory.create(AppModule, { bufferLogs: false, rawBody: true });
  const logger = new Logger('Bootstrap');

  // Security headers (CSP disabled so the Swagger UI + JSON API work).
  app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));

  // Structured request logging with secret redaction.
  app.use(
    pinoHttp({
      autoLogging: true,
      redact: ['req.headers.authorization', 'req.headers.cookie', 'req.headers["x-api-key"]'],
      level: process.env.LOG_LEVEL ?? 'info',
    }),
  );

  app.use(cookieParser());
  app.setGlobalPrefix('api');

  // Allow the configured origin(s); in dev also accept any localhost port so the
  // web dev server can run on a harness-assigned port (autoPort).
  const allowed = (process.env.CORS_ORIGIN ?? 'http://localhost:5173').split(',').map((o) => o.trim());
  const isProd = process.env.NODE_ENV === 'production';
  app.enableCors({
    origin: (origin, cb) => {
      if (!origin) return cb(null, true); // non-browser clients (curl, server-to-server)
      if (allowed.includes(origin)) return cb(null, true);
      if (!isProd && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) return cb(null, true);
      return cb(new Error('Not allowed by CORS'), false);
    },
    credentials: true,
  });
  app.enableShutdownHooks();

  // OpenAPI docs at /api/docs.
  const docConfig = new DocumentBuilder()
    .setTitle('CRM API')
    .setDescription('Multi-tenant CRM — public REST API. Authenticate with a cookie session or an API key (X-Api-Key / Bearer ck_…).')
    .setVersion(process.env.APP_VERSION ?? '0.8.0')
    .addApiKey({ type: 'apiKey', name: 'X-Api-Key', in: 'header' }, 'api-key')
    .addBearerAuth()
    .build();
  SwaggerModule.setup('api/docs', app, SwaggerModule.createDocument(app, docConfig));

  const port = Number(process.env.PORT ?? 4000);
  await app.listen(port, '0.0.0.0');
  logger.log(`API listening on http://localhost:${port}/api  ·  docs at /api/docs`);
}

bootstrap();
