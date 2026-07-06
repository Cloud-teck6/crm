import { Global, Module } from '@nestjs/common';
import { CustomFieldsController } from './custom-fields.controller';
import { CustomFieldsService } from './custom-fields.service';

// Global so record modules can inject CustomFieldsService.validateValues.
@Global()
@Module({
  controllers: [CustomFieldsController],
  providers: [CustomFieldsService],
  exports: [CustomFieldsService],
})
export class CustomFieldsModule {}
