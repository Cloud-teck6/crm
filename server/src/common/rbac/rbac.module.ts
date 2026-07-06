import { Global, Module } from '@nestjs/common';
import { ScopeService } from './scope.service';

// Global so any CRM module can inject ScopeService for data scoping.
@Global()
@Module({
  providers: [ScopeService],
  exports: [ScopeService],
})
export class RbacModule {}
