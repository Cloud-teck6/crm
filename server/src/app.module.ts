import { Module, ValidationPipe } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { ServeStaticModule } from '@nestjs/serve-static';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR, APP_PIPE } from '@nestjs/core';
import { join } from 'node:path';

import { envValidationSchema } from './common/config/env.validation';
import { PrismaModule } from './common/prisma/prisma.module';
import { RbacModule } from './common/rbac/rbac.module';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { PermissionsGuard } from './common/guards/permissions.guard';
import { RequestContextInterceptor } from './common/interceptors/request-context.interceptor';
import { AllExceptionsFilter } from './common/filters/http-exception.filter';

import { AuditModule } from './modules/audit/audit.module';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { RolesModule } from './modules/roles/roles.module';
import { TenantsModule } from './modules/tenants/tenants.module';
import { HealthModule } from './modules/health/health.module';
import { CustomFieldsModule } from './modules/custom-fields/custom-fields.module';
import { AccountsModule } from './modules/accounts/accounts.module';
import { ContactsModule } from './modules/contacts/contacts.module';
import { LeadsModule } from './modules/leads/leads.module';
import { PipelinesModule } from './modules/pipelines/pipelines.module';
import { DealsModule } from './modules/deals/deals.module';
import { ActivitiesModule } from './modules/activities/activities.module';
import { IngestionModule } from './modules/ingestion/ingestion.module';
import { IntegrationsModule } from './modules/integrations/integrations.module';
import { MessagingModule } from './modules/messaging/messaging.module';
import { AutomationModule } from './modules/automation/automation.module';
import { AnalyticsModule } from './modules/analytics/analytics.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { ImportsModule } from './modules/imports/imports.module';
import { ApiKeysModule } from './modules/api-keys/api-keys.module';
import { ComplianceModule } from './modules/compliance/compliance.module';
import { WebhooksOutModule } from './modules/webhooks-out/webhooks-out.module';
import { ExportModule } from './modules/export/export.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validationSchema: envValidationSchema,
    }),
    JwtModule.register({ global: true }),
    // Serve the built web SPA from the API (same origin); /api/* falls through
    // to controllers. Skipped if web/dist isn't built yet.
    ServeStaticModule.forRoot({
      rootPath: join(__dirname, '..', '..', 'web', 'dist'),
      exclude: ['/api/{*rest}'],
      serveStaticOptions: { fallthrough: true },
    }),
    ScheduleModule.forRoot(),
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (c: ConfigService) => [
        { ttl: Number(c.get('THROTTLE_TTL')) || 60000, limit: Number(c.get('THROTTLE_LIMIT')) || 200 },
      ],
    }),
    PrismaModule,
    RbacModule,
    AuditModule,
    AuthModule,
    UsersModule,
    RolesModule,
    TenantsModule,
    HealthModule,
    CustomFieldsModule,
    AccountsModule,
    ContactsModule,
    LeadsModule,
    PipelinesModule,
    DealsModule,
    ActivitiesModule,
    IngestionModule,
    IntegrationsModule,
    MessagingModule,
    AutomationModule,
    AnalyticsModule,
    NotificationsModule,
    ApiKeysModule,
    ImportsModule,
    ComplianceModule,
    WebhooksOutModule,
    ExportModule,
  ],
  providers: [
    // Order matters: rate-limit first, then authenticate, then check permissions.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
    // Establishes the AsyncLocalStorage request store (after guards).
    { provide: APP_INTERCEPTOR, useClass: RequestContextInterceptor },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    {
      provide: APP_PIPE,
      useValue: new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        transformOptions: { enableImplicitConversion: true },
      }),
    },
  ],
})
export class AppModule {}
