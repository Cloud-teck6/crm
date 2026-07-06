import { IsBoolean, IsEnum, IsObject, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { IntegrationProvider } from '@prisma/client';

export class CreateConnectionDto {
  @IsEnum(IntegrationProvider)
  provider!: IntegrationProvider;

  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name!: string;

  // Non-secret + secret config (verifyToken/appSecret/pageAccessToken/googleKey,
  // honeypotField, defaultOwnerId). Secrets are masked in responses.
  @IsOptional()
  @IsObject()
  config?: Record<string, unknown>;
}

export class UpdateConnectionDto {
  @IsOptional() @IsString() @MaxLength(120) name?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
  @IsOptional() @IsObject() config?: Record<string, unknown>;
}
