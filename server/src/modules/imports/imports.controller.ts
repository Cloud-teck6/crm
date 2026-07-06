import { Body, Controller, Get, Param, Post, Res } from '@nestjs/common';
import { Response } from 'express';
import { IsIn, IsObject, IsOptional, IsString } from 'class-validator';
import { ImportsService } from './imports.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { AuthUser } from '../../common/types/auth-user';

class PreviewDto {
  @IsString() objectType!: string;
  @IsString() csv!: string;
}
class StartImportDto {
  @IsString() objectType!: string;
  @IsString() csv!: string;
  @IsObject() mapping!: Record<string, string>;
  @IsOptional() @IsIn(['skip', 'update', 'create']) dedupeStrategy?: string;
}

@Controller('imports')
export class ImportsController {
  constructor(private readonly imports: ImportsService) {}

  @Post('preview')
  @RequirePermissions('import:create')
  preview(@Body() dto: PreviewDto) {
    return this.imports.preview(dto.objectType, dto.csv);
  }

  @Post()
  @RequirePermissions('import:create')
  start(@CurrentUser() user: AuthUser, @Body() dto: StartImportDto) {
    return this.imports.start(user, dto);
  }

  @Get()
  @RequirePermissions('import:create')
  list() {
    return this.imports.list();
  }

  @Get(':id')
  @RequirePermissions('import:create')
  status(@Param('id') id: string) {
    return this.imports.status(id);
  }

  @Get(':id/errors.csv')
  @RequirePermissions('import:create')
  async errors(@Param('id') id: string, @Res() res: Response) {
    const csv = await this.imports.errorsCsv(id);
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="import-${id}-errors.csv"`);
    res.send(csv);
  }
}
