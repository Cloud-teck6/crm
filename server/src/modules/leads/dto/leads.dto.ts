import {
  IsArray,
  IsBoolean,
  IsEmail,
  IsEnum,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { LeadStatus } from '@prisma/client';

export class CreateLeadDto {
  @IsOptional() @IsString() @MaxLength(120) firstName?: string;
  @IsOptional() @IsString() @MaxLength(120) lastName?: string;
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsString() @MaxLength(40) phone?: string;
  @IsOptional() @IsString() @MaxLength(160) company?: string;
  @IsOptional() @IsString() @MaxLength(60) source?: string;
  @IsOptional() @IsString() @MaxLength(160) campaign?: string;
  @IsOptional() @IsEnum(LeadStatus) status?: LeadStatus;
  @IsOptional() @IsInt() @Min(0) score?: number;
  @IsOptional() @IsString() ownerId?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) tags?: string[];
  @IsOptional() @IsObject() customFields?: Record<string, unknown>;
}

export class UpdateLeadDto {
  @IsOptional() @IsString() @MaxLength(120) firstName?: string;
  @IsOptional() @IsString() @MaxLength(120) lastName?: string;
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsString() @MaxLength(40) phone?: string;
  @IsOptional() @IsString() @MaxLength(160) company?: string;
  @IsOptional() @IsString() @MaxLength(60) source?: string;
  @IsOptional() @IsString() @MaxLength(160) campaign?: string;
  @IsOptional() @IsEnum(LeadStatus) status?: LeadStatus;
  @IsOptional() @IsInt() @Min(0) score?: number;
  @IsOptional() @IsString() ownerId?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) tags?: string[];
  @IsOptional() @IsObject() customFields?: Record<string, unknown>;
}

export class ConvertLeadDto {
  // Link to an existing contact instead of creating one.
  @IsOptional() @IsString() contactId?: string;
  // Create an Account from the lead's company.
  @IsOptional() @IsBoolean() createAccount?: boolean;
  // Create a Deal in the given pipeline (first stage if stageId omitted).
  @IsOptional() @IsBoolean() createDeal?: boolean;
  @IsOptional() @IsString() dealTitle?: string;
  @IsOptional() @IsString() pipelineId?: string;
  @IsOptional() @IsString() stageId?: string;
}
