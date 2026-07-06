import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../types/auth-user';
import { expandPermissions } from '../config/permissions';
import { ApiKeysService } from '../../modules/api-keys/api-keys.service';

export interface AccessTokenPayload {
  sub: string; // userId
  tid: string; // tenantId
}

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly apiKeys: ApiKeysService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const req = context.switchToHttp().getRequest<Request>();

    // Public REST API: an API key (X-Api-Key or "Bearer ck_…") authenticates
    // tenant-wide with the key's permissions.
    const apiKeyRaw = this.extractApiKey(req);
    if (apiKeyRaw) {
      const authUser = await this.apiKeys.resolve(apiKeyRaw);
      if (!authUser) throw new UnauthorizedException('Invalid API key');
      (req as any).user = authUser;
      return true;
    }

    const token = this.extractToken(req);
    if (!token) throw new UnauthorizedException('Missing access token');

    let payload: AccessTokenPayload;
    try {
      payload = await this.jwt.verifyAsync<AccessTokenPayload>(token, {
        secret: this.config.getOrThrow<string>('JWT_ACCESS_SECRET'),
      });
    } catch {
      throw new UnauthorizedException('Invalid or expired token');
    }

    // No ALS context yet (interceptor runs after guards), so scope explicitly.
    const user = await this.prisma.client.user.findFirst({
      where: {
        id: payload.sub,
        tenantId: payload.tid,
        status: 'ACTIVE',
        deletedAt: null,
      },
      include: { role: true },
    });
    if (!user || !user.role) throw new UnauthorizedException('User not found or inactive');

    const authUser: AuthUser = {
      id: user.id,
      tenantId: user.tenantId,
      email: user.email,
      fullName: user.fullName,
      roleId: user.roleId,
      roleName: user.role.name,
      dataScope: user.role.dataScope,
      permissions: expandPermissions(user.role.permissions),
      fieldRestrictions: (user.role.fieldRestrictions as Record<string, string[]>) ?? {},
      teamId: user.teamId,
      territoryId: user.territoryId,
    };
    (req as any).user = authUser;
    return true;
  }

  private extractToken(req: Request): string | null {
    const cookieToken = (req as any).cookies?.access_token;
    if (cookieToken) return cookieToken;
    const auth = req.headers.authorization;
    if (auth?.startsWith('Bearer ') && !auth.slice(7).startsWith('ck_')) return auth.slice(7);
    return null;
  }

  private extractApiKey(req: Request): string | null {
    const header = req.headers['x-api-key'];
    if (typeof header === 'string' && header.startsWith('ck_')) return header;
    const auth = req.headers.authorization;
    if (auth?.startsWith('Bearer ck_')) return auth.slice(7);
    return null;
  }
}
