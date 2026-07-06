import {
  IsArray,
  IsEnum,
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { MessageChannel, TemplateStatus } from '@prisma/client';

export class CreateTemplateDto {
  @IsString() @MinLength(1) @MaxLength(120) name!: string;
  @IsEnum(MessageChannel) channel!: MessageChannel;
  @IsOptional() @IsString() @MaxLength(40) category?: string;
  @IsOptional() @IsString() @MaxLength(10) language?: string;
  @IsOptional() @IsString() @MaxLength(200) subject?: string;
  @IsString() @MinLength(1) @MaxLength(5000) body!: string;
  @IsOptional() @IsEnum(TemplateStatus) status?: TemplateStatus;
}

export class UpdateTemplateDto {
  @IsOptional() @IsString() @MaxLength(120) name?: string;
  @IsOptional() @IsString() @MaxLength(40) category?: string;
  @IsOptional() @IsString() @MaxLength(200) subject?: string;
  @IsOptional() @IsString() @MaxLength(5000) body?: string;
  @IsOptional() @IsEnum(TemplateStatus) status?: TemplateStatus;
}

export class SendMessageDto {
  @IsEnum(MessageChannel) channel!: MessageChannel;

  // Link + recipient resolution: one of contactId / leadId (+ optional dealId),
  // or an explicit `to` address/number.
  @IsOptional() @IsString() contactId?: string;
  @IsOptional() @IsString() leadId?: string;
  @IsOptional() @IsString() dealId?: string;
  @IsOptional() @IsString() to?: string;

  @IsOptional() @IsString() @MaxLength(200) subject?: string;
  @IsOptional() @IsString() @MaxLength(5000) body?: string;

  // Use an approved/stored template (required for WhatsApp outside 24h window).
  @IsOptional() @IsString() templateId?: string;
  @IsOptional() @IsObject() templateVars?: Record<string, string>;
}

export class LogCallDto {
  @IsIn(['INBOUND', 'OUTBOUND']) direction!: 'INBOUND' | 'OUTBOUND';
  @IsOptional() @IsString() contactId?: string;
  @IsOptional() @IsString() leadId?: string;
  @IsOptional() @IsString() dealId?: string;
  @IsOptional() @IsString() disposition?: string;
  @IsOptional() @IsString() @MaxLength(5000) notes?: string;
}

export class ClickToCallDto {
  @IsOptional() @IsString() contactId?: string;
  @IsOptional() @IsString() leadId?: string;
  @IsOptional() @IsString() dealId?: string;
  @IsOptional() @IsString() to?: string;
}
