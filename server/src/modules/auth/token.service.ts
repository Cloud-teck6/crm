import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Response } from 'express';
import * as argon2 from 'argon2';
import { PrismaService } from '../../common/prisma/prisma.service';

const ACCESS_COOKIE = 'access_token';
const REFRESH_COOKIE = 'refresh_token';

export interface IssuedTokens {
  accessToken: string;
  refreshToken: string;
  sessionId: string;
}

@Injectable()
export class TokenService {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  /** Creates a Session row and signs access + refresh tokens bound to it. */
  async issue(
    userId: string,
    tenantId: string,
    meta: { ip?: string; userAgent?: string },
  ): Promise<IssuedTokens> {
    const refreshTtl = this.config.get<number>('JWT_REFRESH_TTL', 1209600);
    const expiresAt = new Date(Date.now() + refreshTtl * 1000);

    // Create the session first so its id can be embedded in the refresh token.
    const session = await this.prisma.client.session.create({
      data: {
        tenantId,
        userId,
        refreshTokenHash: 'pending',
        ip: meta.ip,
        userAgent: meta.userAgent,
        expiresAt,
      },
    });

    const accessToken = await this.signAccess(userId, tenantId);
    const refreshToken = await this.signRefresh(userId, tenantId, session.id);
    const refreshTokenHash = await argon2.hash(refreshToken);

    await this.prisma.client.session.updateMany({
      where: { id: session.id, tenantId },
      data: { refreshTokenHash },
    });

    return { accessToken, refreshToken, sessionId: session.id };
  }

  /** Validates a refresh token, rotates the session, and returns new tokens. */
  async rotate(
    refreshToken: string,
    meta: { ip?: string; userAgent?: string },
  ): Promise<IssuedTokens | null> {
    let payload: { sub: string; tid: string; sid: string };
    try {
      payload = await this.jwt.verifyAsync(refreshToken, {
        secret: this.config.getOrThrow<string>('JWT_REFRESH_SECRET'),
      });
    } catch {
      return null;
    }

    const session = await this.prisma.client.session.findFirst({
      where: { id: payload.sid, tenantId: payload.tid, userId: payload.sub },
    });
    if (!session || session.revokedAt || session.expiresAt < new Date()) return null;

    const matches = await argon2.verify(session.refreshTokenHash, refreshToken);
    if (!matches) {
      // Token reuse / tampering: revoke the session defensively.
      await this.prisma.client.session.updateMany({
        where: { id: session.id, tenantId: payload.tid },
        data: { revokedAt: new Date() },
      });
      return null;
    }

    // Rotate: revoke old, issue fresh.
    await this.prisma.client.session.updateMany({
      where: { id: session.id, tenantId: payload.tid },
      data: { revokedAt: new Date() },
    });
    return this.issue(payload.sub, payload.tid, meta);
  }

  async revokeSession(sessionId: string, tenantId: string): Promise<void> {
    await this.prisma.client.session.updateMany({
      where: { id: sessionId, tenantId },
      data: { revokedAt: new Date() },
    });
  }

  async revokeByRefreshToken(refreshToken: string): Promise<void> {
    try {
      const payload = await this.jwt.verifyAsync(refreshToken, {
        secret: this.config.getOrThrow<string>('JWT_REFRESH_SECRET'),
      });
      await this.revokeSession(payload.sid, payload.tid);
    } catch {
      /* already invalid — nothing to revoke */
    }
  }

  private signAccess(userId: string, tenantId: string): Promise<string> {
    return this.jwt.signAsync(
      { sub: userId, tid: tenantId },
      {
        secret: this.config.getOrThrow<string>('JWT_ACCESS_SECRET'),
        expiresIn: this.config.get<number>('JWT_ACCESS_TTL', 900),
      },
    );
  }

  private signRefresh(userId: string, tenantId: string, sessionId: string): Promise<string> {
    return this.jwt.signAsync(
      { sub: userId, tid: tenantId, sid: sessionId },
      {
        secret: this.config.getOrThrow<string>('JWT_REFRESH_SECRET'),
        expiresIn: this.config.get<number>('JWT_REFRESH_TTL', 1209600),
      },
    );
  }

  // Omit the Domain attribute for localhost / unset — host-only cookies are
  // simpler and avoid the localhost-vs-127.0.0.1 mismatch. Set a real Domain
  // only when sharing cookies across subdomains in production.
  private cookieDomain(): string | undefined {
    const domain = this.config.get<string>('COOKIE_DOMAIN', '');
    if (!domain || domain === 'localhost') return undefined;
    return domain;
  }

  setAuthCookies(res: Response, tokens: IssuedTokens): void {
    const secure = this.config.get('COOKIE_SECURE', 'false') === 'true'
      || this.config.get('COOKIE_SECURE') === true;
    const domain = this.cookieDomain();
    const accessTtl = this.config.get<number>('JWT_ACCESS_TTL', 900);
    const refreshTtl = this.config.get<number>('JWT_REFRESH_TTL', 1209600);

    res.cookie(ACCESS_COOKIE, tokens.accessToken, {
      httpOnly: true,
      secure,
      sameSite: 'lax',
      domain,
      path: '/',
      maxAge: accessTtl * 1000,
    });
    // Path is scoped to the auth routes (note the global 'api' prefix) so the
    // refresh token is only ever sent to /api/auth/refresh and /api/auth/logout.
    res.cookie(REFRESH_COOKIE, tokens.refreshToken, {
      httpOnly: true,
      secure,
      sameSite: 'lax',
      domain,
      path: '/api/auth',
      maxAge: refreshTtl * 1000,
    });
  }

  clearAuthCookies(res: Response): void {
    const domain = this.cookieDomain();
    res.clearCookie(ACCESS_COOKIE, { domain, path: '/' });
    res.clearCookie(REFRESH_COOKIE, { domain, path: '/api/auth' });
  }

  static readonly REFRESH_COOKIE = REFRESH_COOKIE;
  static readonly ACCESS_COOKIE = ACCESS_COOKIE;
}
