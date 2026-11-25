import { IsBoolean, IsNotEmpty, IsString, MaxLength } from 'class-validator';

/** Token del enlace de baja (ver mail/unsubscribe-token). */
export class MailPreferencesTokenDto {
  @IsNotEmpty()
  @IsString()
  @MaxLength(100)
  unsubscribeToken: string;
}

export class UpdateMailPreferencesDto extends MailPreferencesTokenDto {
  @IsBoolean()
  plantNotifications: boolean;
}

/** Cambio con la sesión iniciada (sin token). */
export class UpdateOwnMailPreferencesDto {
  @IsBoolean()
  plantNotifications: boolean;
}
