import {
  Body,
  Controller,
  Get,
  Post,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { TokenService } from './token.service';
import { Public } from '../../common/decorators/public.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthUser } from '../../common/types/auth-user';
import { expandPermissions } from '../../common/config/permissions';
import { RegisterDto, LoginDto, TwoFactorCodeDto } from './dto/auth.dto';

function meta(req: Request) {
  const xff = req.headers['x-forwarded-for'];
  const ip =
    (typeof xff === 'string' && xff.split(',')[0].trim()) ||
    req.ip ||
    req.socket?.remoteAddress ||
    undefined;
  return { ip: ip || undefined, userAgent: req.headers['user-agent'] };
}

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly tokens: TokenService,
  ) {}

  @Public()
  @Post('register')
  async register(
    @Body() dto: RegisterDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const m = meta(req);
    const { tenant, user } = await this.auth.register(dto, m);
    const issued = await this.tokens.issue(user.id, tenant.id, m);
    this.tokens.setAuthCookies(res, issued);
    return {
      user: { id: user.id, email: user.email, fullName: user.fullName },
      tenant: { id: tenant.id, name: tenant.name, slug: tenant.slug },
      accessToken: issued.accessToken, // also returned for non-cookie clients
    };
  }

  @Public()
  @Post('login')
  async login(
    @Body() dto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const m = meta(req);
    const user = await this.auth.validateLogin(dto);
    await this.auth.recordLogin(user, m);
    const issued = await this.tokens.issue(user.id, user.tenantId, m);
    this.tokens.setAuthCookies(res, issued);

    const authUser: AuthUser = {
      id: user.id,
      tenantId: user.tenantId,
      email: user.email,
      fullName: user.fullName,
      roleId: user.roleId,
      roleName: (user as any).role.name,
      dataScope: (user as any).role.dataScope,
      permissions: expandPermissions((user as any).role.permissions),
      fieldRestrictions: ((user as any).role.fieldRestrictions as Record<string, string[]>) ?? {},
      teamId: user.teamId,
      territoryId: user.territoryId,
    };
    return { ...(await this.auth.me(authUser)), accessToken: issued.accessToken };
  }

  @Public()
  @Post('refresh')
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const refreshToken = (req as any).cookies?.[TokenService.REFRESH_COOKIE];
    if (!refreshToken) throw new UnauthorizedException('No refresh token');
    const issued = await this.tokens.rotate(refreshToken, meta(req));
    if (!issued) {
      this.tokens.clearAuthCookies(res);
      throw new UnauthorizedException('Invalid refresh token');
    }
    this.tokens.setAuthCookies(res, issued);
    return { accessToken: issued.accessToken };
  }

  @Public()
  @Post('logout')
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const refreshToken = (req as any).cookies?.[TokenService.REFRESH_COOKIE];
    if (refreshToken) await this.tokens.revokeByRefreshToken(refreshToken);
    this.tokens.clearAuthCookies(res);
    return { ok: true };
  }

  @Get('me')
  me(@CurrentUser() user: AuthUser) {
    return this.auth.me(user);
  }

  @Post('2fa/setup')
  setup2fa(@CurrentUser() user: AuthUser) {
    return this.auth.setupTwoFactor(user);
  }

  @Post('2fa/enable')
  enable2fa(@CurrentUser() user: AuthUser, @Body() dto: TwoFactorCodeDto) {
    return this.auth.enableTwoFactor(user, dto.code);
  }

  @Post('2fa/disable')
  disable2fa(@CurrentUser() user: AuthUser, @Body() dto: TwoFactorCodeDto) {
    return this.auth.disableTwoFactor(user, dto.code);
  }
}
