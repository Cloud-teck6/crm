import { Body, Controller, Post } from '@nestjs/common';
import { IsEmail } from 'class-validator';
import { ComplianceService } from './compliance.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { AuthUser } from '../../common/types/auth-user';

class SubjectDto {
  @IsEmail() email!: string;
}

@Controller('compliance')
export class ComplianceController {
  constructor(private readonly compliance: ComplianceService) {}

  @Post('export')
  @RequirePermissions('settings:manage')
  export(@CurrentUser() user: AuthUser, @Body() dto: SubjectDto) {
    return this.compliance.exportData(user, dto.email);
  }

  @Post('delete')
  @RequirePermissions('settings:manage')
  remove(@CurrentUser() user: AuthUser, @Body() dto: SubjectDto) {
    return this.compliance.deleteData(user, dto.email);
  }
}
