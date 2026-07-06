import { Body, Controller, Get, Patch } from '@nestjs/common';
import { IsObject, IsOptional, IsString, MaxLength } from 'class-validator';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { AuthUser } from '../../common/types/auth-user';

class UpdateTenantDto {
  @IsOptional() @IsString() @MaxLength(120) name?: string;
  @IsOptional() @IsString() @MaxLength(10) currency?: string;
  @IsOptional() @IsString() @MaxLength(64) timezone?: string;
  @IsOptional() @IsObject() settings?: Record<string, unknown>;
}

@Controller('tenant')
export class TenantsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  async current(@CurrentUser() user: AuthUser) {
    // Tenant has no tenantId column; fetch by the caller's tenant id.
    const tenant = await this.prisma.client.tenant.findFirst({ where: { id: user.tenantId } });
    return tenant;
  }

  @Patch()
  @RequirePermissions('settings:manage')
  async update(@CurrentUser() user: AuthUser, @Body() dto: UpdateTenantDto) {
    const before = await this.prisma.client.tenant.findFirst({ where: { id: user.tenantId } });
    await this.prisma.client.tenant.updateMany({
      where: { id: user.tenantId },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.currency !== undefined ? { currency: dto.currency } : {}),
        ...(dto.timezone !== undefined ? { timezone: dto.timezone } : {}),
        ...(dto.settings !== undefined ? { settings: dto.settings as any } : {}),
      },
    });
    await this.audit.log({
      action: 'tenant.update',
      resource: 'Tenant',
      resourceId: user.tenantId,
      before: { name: before?.name, currency: before?.currency, timezone: before?.timezone },
      after: { name: dto.name, currency: dto.currency, timezone: dto.timezone },
    });
    return this.prisma.client.tenant.findFirst({ where: { id: user.tenantId } });
  }
}
