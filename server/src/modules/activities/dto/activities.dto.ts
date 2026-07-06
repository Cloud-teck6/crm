import { IsEnum, IsISO8601, IsOptional, IsString, MaxLength } from 'class-validator';
import { ActivityType } from '@prisma/client';

export class CreateActivityDto {
  @IsEnum(ActivityType) type!: ActivityType;
  @IsOptional() @IsString() @MaxLength(200) subject?: string;
  @IsOptional() @IsString() @MaxLength(5000) body?: string;
  @IsOptional() @IsString() assigneeId?: string;
  @IsOptional() @IsISO8601() dueAt?: string;
  @IsOptional() @IsString() leadId?: string;
  @IsOptional() @IsString() contactId?: string;
  @IsOptional() @IsString() dealId?: string;
}

export class UpdateActivityDto {
  @IsOptional() @IsString() @MaxLength(200) subject?: string;
  @IsOptional() @IsString() @MaxLength(5000) body?: string;
  @IsOptional() @IsString() assigneeId?: string;
  @IsOptional() @IsISO8601() dueAt?: string;
}
