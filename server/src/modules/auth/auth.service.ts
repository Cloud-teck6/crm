import {
  BadRequestException,
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as argon2 from 'argon2';
import { authenticator } from 'otplib';
import * as qrcode from 'qrcode';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { DEFAULT_ROLES } from '../../common/config/permissions';
import { AuthUser } from '../../common/types/auth-user';
import { RegisterDto, LoginDto } from './dto/auth.dto';

interface RequestMeta {
  ip?: string;
  userAgent?: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly config: ConfigService,
  ) {}

  /** Self-serve signup: creates tenant + default roles + Super Admin user. */
  async register(dto: RegisterDto, meta: RequestMeta) {
    const slug = await this.uniqueSlug(dto.companyName);

    const existingTenant = await this.prisma.client.tenant.findUnique({ where: { slug } });
    if (existingTenant) throw new ConflictException('Workspace already exists');

    const tenant = await this.prisma.client.tenant.create({
      data: {
        name: dto.companyName,
        slug,
        currency: dto.currency ?? this.config.get('DEFAULT_CURRENCY', 'INR'),
        timezone: dto.timezone ?? this.config.get('DEFAULT_TIMEZONE', 'Asia/Kolkata'),
      },
    });

    await this.provisionDefaultRoles(tenant.id);
    const superAdmin = await this.prisma.client.role.findFirstOrThrow({
      where: { tenantId: tenant.id, name: 'Super Admin' },
    });

    const passwordHash = await argon2.hash(dto.password);
    const user = await this.prisma.client.user.create({
      data: {
        tenantId: tenant.id,
        email: dto.email.toLowerCase(),
        fullName: dto.fullName,
        passwordHash,
        status: 'ACTIVE',
        roleId: superAdmin.id,
      },
    });

    await this.audit.log({
      tenantId: tenant.id,
      actorId: user.id,
      action: 'tenant.register',
      resource: 'Tenant',
      resourceId: tenant.id,
      after: { name: tenant.name, slug: tenant.slug },
      ip: meta.ip,
      userAgent: meta.userAgent,
    });

    return { tenant, user };
  }

  /** Verifies credentials (+ 2FA if enabled) and returns the user to log in. */
  async validateLogin(dto: LoginDto) {
    const email = dto.email.toLowerCase();

    // Resolve tenant — pre-auth, so these reads are deliberately unscoped.
    let tenantId: string | undefined;
    if (dto.tenantSlug) {
      const tenant = await this.prisma.client.tenant.findUnique({
        where: { slug: dto.tenantSlug },
      });
      if (!tenant) throw new UnauthorizedException('Invalid credentials');
      tenantId = tenant.id;
    } else {
      const candidates = await this.prisma.client.user.findMany({
        where: { email, deletedAt: null },
        select: { tenantId: true },
      });
      if (candidates.length === 0) throw new UnauthorizedException('Invalid credentials');
      if (candidates.length > 1) {
        throw new BadRequestException('Multiple workspaces — provide tenantSlug');
      }
      tenantId = candidates[0].tenantId;
    }

    const user = await this.prisma.client.user.findFirst({
      where: { tenantId, email, deletedAt: null },
      include: { role: true },
    });
    if (!user || !user.passwordHash) throw new UnauthorizedException('Invalid credentials');
    if (user.status !== 'ACTIVE') throw new UnauthorizedException('Account is not active');

    const ok = await argon2.verify(user.passwordHash, dto.password);
    if (!ok) throw new UnauthorizedException('Invalid credentials');

    if (user.twoFactorEnabled) {
      if (!dto.twoFactorCode) {
        throw new UnauthorizedException({
          message: 'Two-factor code required',
          twoFactorRequired: true,
        });
      }
      const valid = authenticator.verify({
        token: dto.twoFactorCode,
        secret: user.twoFactorSecret!,
      });
      if (!valid) throw new UnauthorizedException('Invalid two-factor code');
    }

    return user;
  }

  async recordLogin(user: { id: string; tenantId: string }, meta: RequestMeta) {
    await this.prisma.client.user.updateMany({
      where: { id: user.id, tenantId: user.tenantId },
      data: { lastLoginAt: new Date() },
    });
    await this.audit.log({
      tenantId: user.tenantId,
      actorId: user.id,
      action: 'user.login',
      resource: 'User',
      resourceId: user.id,
      ip: meta.ip,
      userAgent: meta.userAgent,
    });
  }

  async me(authUser: AuthUser) {
    const user = await this.prisma.client.user.findFirst({
      where: { id: authUser.id },
      include: { role: true, team: true, territory: true },
    });
    if (!user) throw new UnauthorizedException();
    return {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      tenantId: user.tenantId,
      status: user.status,
      twoFactorEnabled: user.twoFactorEnabled,
      role: {
        id: user.role.id,
        name: user.role.name,
        dataScope: user.role.dataScope,
      },
      team: user.team ? { id: user.team.id, name: user.team.name } : null,
      territory: user.territory ? { id: user.territory.id, name: user.territory.name } : null,
      permissions: Array.from(authUser.permissions).sort(),
    };
  }

  // ── Two-factor (TOTP) ──────────────────────────────────────────────────
  async setupTwoFactor(authUser: AuthUser) {
    const secret = authenticator.generateSecret();
    await this.prisma.client.user.updateMany({
      where: { id: authUser.id },
      data: { twoFactorSecret: secret, twoFactorEnabled: false },
    });
    const appName = this.config.get('APP_NAME', 'CRM');
    const otpauth = authenticator.keyuri(authUser.email, appName, secret);
    const qrDataUrl = await qrcode.toDataURL(otpauth);
    return { otpauthUrl: otpauth, qrDataUrl };
  }

  async enableTwoFactor(authUser: AuthUser, code: string) {
    const user = await this.prisma.client.user.findFirst({ where: { id: authUser.id } });
    if (!user?.twoFactorSecret) throw new BadRequestException('Run 2FA setup first');
    const valid = authenticator.verify({ token: code, secret: user.twoFactorSecret });
    if (!valid) throw new BadRequestException('Invalid code');
    await this.prisma.client.user.updateMany({
      where: { id: authUser.id },
      data: { twoFactorEnabled: true },
    });
    await this.audit.log({ action: 'user.2fa_enabled', resource: 'User', resourceId: authUser.id });
    return { enabled: true };
  }

  async disableTwoFactor(authUser: AuthUser, code: string) {
    const user = await this.prisma.client.user.findFirst({ where: { id: authUser.id } });
    if (!user?.twoFactorSecret) throw new BadRequestException('2FA is not set up');
    const valid = authenticator.verify({ token: code, secret: user.twoFactorSecret });
    if (!valid) throw new BadRequestException('Invalid code');
    await this.prisma.client.user.updateMany({
      where: { id: authUser.id },
      data: { twoFactorEnabled: false, twoFactorSecret: null },
    });
    await this.audit.log({ action: 'user.2fa_disabled', resource: 'User', resourceId: authUser.id });
    return { enabled: false };
  }

  // ── helpers ────────────────────────────────────────────────────────────
  private async provisionDefaultRoles(tenantId: string): Promise<void> {
    for (const r of DEFAULT_ROLES) {
      await this.prisma.client.role.create({
        data: {
          tenantId,
          name: r.name,
          description: r.description,
          dataScope: r.dataScope,
          permissions: r.permissions,
          isSystem: true,
        },
      });
    }
  }

  private async uniqueSlug(name: string): Promise<string> {
    const base = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'workspace';
    let slug = base;
    let n = 1;
    // Unscoped lookup (pre-auth); slug is globally unique.
    while (await this.prisma.client.tenant.findUnique({ where: { slug } })) {
      slug = `${base}-${n++}`;
    }
    return slug;
  }
}
