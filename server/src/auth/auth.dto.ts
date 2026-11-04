import { IsEmail, IsObject, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class RegisterDto {
  @IsEmail() @MaxLength(200) email: string;
  @IsString() @MinLength(8, { message: 'Password must be at least 8 characters' }) @MaxLength(200) password: string;
  @IsString() @MinLength(1) @MaxLength(80) name: string;
}

export class LoginDto {
  @IsEmail() @MaxLength(200) email: string;
  @IsString() @MaxLength(200) password: string;
}

export class UpdateProfileDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(80) name?: string;
  /** Other names, bank accounts… as kept by the app. */
  @IsOptional() @IsObject() profile?: Record<string, unknown>;
}
