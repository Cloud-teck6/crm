import { IsObject, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateAccountDto {
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  name!: string;

  @IsOptional() @IsString() @MaxLength(160) domain?: string;
  @IsOptional() @IsString() @MaxLength(120) industry?: string;
  @IsOptional() @IsString() ownerId?: string;
  @IsOptional() @IsObject() customFields?: Record<string, unknown>;
}

export class UpdateAccountDto {
  @IsOptional() @IsString() @MaxLength(160) name?: string;
  @IsOptional() @IsString() @MaxLength(160) domain?: string;
  @IsOptional() @IsString() @MaxLength(120) industry?: string;
  @IsOptional() @IsString() ownerId?: string;
  @IsOptional() @IsObject() customFields?: Record<string, unknown>;
}
