import { Controller, Get, HttpException, HttpStatus } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { PrismaService } from '../../common/prisma/prisma.service';
import { Public } from '../../common/decorators/public.decorator';

@Controller('health')
@Public()
@SkipThrottle()
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  private async dbUp(): Promise<boolean> {
    try {
      await this.prisma.client.$queryRaw`SELECT 1`;
      return true;
    } catch {
      return false;
    }
  }

  // Liveness — always 200 (process is up), reports DB status.
  @Get()
  async health() {
    const db = (await this.dbUp()) ? 'up' : 'down';
    return {
      status: db === 'up' ? 'ok' : 'degraded',
      db,
      version: process.env.APP_VERSION ?? '0.8.0',
      timestamp: new Date().toISOString(),
    };
  }

  // Readiness — 503 when a dependency is unavailable (for load balancers).
  @Get('ready')
  async ready() {
    if (!(await this.dbUp())) {
      throw new HttpException({ status: 'not_ready', db: 'down' }, HttpStatus.SERVICE_UNAVAILABLE);
    }
    return { status: 'ready', db: 'up' };
  }
}
