import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable } from 'rxjs';
import { Request } from 'express';
import { requestContext, RequestStore } from '../context/request-context';
import { AuthUser } from '../types/auth-user';

/**
 * Establishes the AsyncLocalStorage request store AFTER guards have run, so the
 * authenticated tenant/user is available to the Prisma tenant extension and the
 * AuditService for the remainder of the request. The handler is subscribed
 * inside `requestContext.run(...)` so async DB calls inherit the store.
 */
@Injectable()
export class RequestContextInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest<Request>();
    const user: AuthUser | undefined = (req as any).user;

    const store: RequestStore = {
      tenantId: user?.tenantId,
      userId: user?.id,
      ip: this.clientIp(req),
      userAgent: req.headers['user-agent'],
    };

    return new Observable((subscriber) => {
      requestContext.run(store, () => {
        next.handle().subscribe(subscriber);
      });
    });
  }

  private clientIp(req: Request): string | undefined {
    const xff = req.headers['x-forwarded-for'];
    if (typeof xff === 'string' && xff.length) return xff.split(',')[0].trim();
    return req.ip || req.socket?.remoteAddress || undefined;
  }
}
