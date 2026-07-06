import { Body, Controller, Delete, Get, Param, Post } from '@nestjs/common';
import { ArrayNotEmpty, IsArray, IsString, MaxLength, MinLength } from 'class-validator';
import { ApiKeysService } from './api-keys.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { AuthUser } from '../../common/types/auth-user';

class CreateApiKeyDto {
  @IsString() @MinLength(1) @MaxLength(80) name!: string;
  @IsArray() @ArrayNotEmpty() @IsString({ each: true }) permissions!: string[];
}

@Controller('api-keys')
export class ApiKeysController {
  constructor(private readonly apiKeys: ApiKeysService) {}

  @Get()
  @RequirePermissions('settings:manage')
  list() {
    return this.apiKeys.list();
  }

  @Post()
  @RequirePermissions('settings:manage')
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateApiKeyDto) {
    return this.apiKeys.create(user, dto);
  }

  @Delete(':id')
  @RequirePermissions('settings:manage')
  revoke(@Param('id') id: string) {
    return this.apiKeys.revoke(id);
  }
}
