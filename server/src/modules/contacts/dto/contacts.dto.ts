import { IsArray, IsEmail, IsObject, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateContactDto {
  @IsOptional() @IsString() @MaxLength(120) firstName?: string;
  @IsOptional() @IsString() @MaxLength(120) lastName?: string;
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsString() @MaxLength(40) phone?: string;
  @IsOptional() @IsString() accountId?: string;
  @IsOptional() @IsString() ownerId?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) tags?: string[];
  @IsOptional() @IsObject() customFields?: Record<string, unknown>;
}

export class UpdateContactDto {
  @IsOptional() @IsString() @MaxLength(120) firstName?: string;
  @IsOptional() @IsString() @MaxLength(120) lastName?: string;
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsString() @MaxLength(40) phone?: string;
  @IsOptional() @IsString() accountId?: string;
  @IsOptional() @IsString() ownerId?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) tags?: string[];
  @IsOptional() @IsObject() customFields?: Record<string, unknown>;
}
