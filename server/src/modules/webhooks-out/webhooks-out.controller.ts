import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { ArrayNotEmpty, IsArray, IsBoolean, IsOptional, IsString, IsUrl, MaxLength } from 'class-validator';
import { WebhooksOutService } from './webhooks-out.service';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';

class CreateSubDto {
  @IsString() @MaxLength(120) name!: string;
  @IsUrl({ require_tld: false }) url!: string;
  @IsArray() @ArrayNotEmpty() @IsString({ each: true }) events!: string[];
  @IsOptional() @IsString() secret?: string;
}
class UpdateSubDto {
  @IsOptional() @IsString() @MaxLength(120) name?: string;
  @IsOptional() @IsUrl({ require_tld: false }) url?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) events?: string[];
  @IsOptional() @IsBoolean() isActive?: boolean;
  @IsOptional() @IsString() secret?: string;
}

@Controller('webhook-subscriptions')
export class WebhooksOutController {
  constructor(private readonly subs: WebhooksOutService) {}

  @Get()
  @RequirePermissions('integration:view')
  list() {
    return this.subs.list();
  }

  @Post()
  @RequirePermissions('integration:manage')
  create(@Body() dto: CreateSubDto) {
    return this.subs.create(dto);
  }

  @Patch(':id')
  @RequirePermissions('integration:manage')
  update(@Param('id') id: string, @Body() dto: UpdateSubDto) {
    return this.subs.update(id, dto);
  }

  @Delete(':id')
  @RequirePermissions('integration:manage')
  remove(@Param('id') id: string) {
    return this.subs.remove(id);
  }
}
