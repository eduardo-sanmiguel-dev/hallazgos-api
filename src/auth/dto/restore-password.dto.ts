import { IsEmail, IsNotEmpty, IsString } from 'class-validator';

export class RestorePasswordDto {
  @IsEmail()
  email: string;

  @IsNotEmpty()
  password: string;

  // Token del enlace del correo de recuperación.
  @IsString()
  @IsNotEmpty()
  token: string;
}
