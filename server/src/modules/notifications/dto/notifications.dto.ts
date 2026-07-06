import { ArrayUnique, IsArray, IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class UpdatePreferencesDto {
  @IsOptional()
  @IsArray()
  @IsIn(['IN_APP', 'EMAIL', 'SLACK'], { each: true })
  @ArrayUnique()
  channels?: string[];

  @IsOptional() @IsString() slackWebhookUrl?: string;
  @IsOptional() @IsInt() @Min(0) @Max(23) quietHoursStart?: number;
  @IsOptional() @IsInt() @Min(0) @Max(23) quietHoursEnd?: number;
  @IsOptional() @IsArray() @IsString({ each: true }) mutedTriggers?: string[];
}
