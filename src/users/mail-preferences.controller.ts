import { Body, Controller, HttpCode, Post, UseGuards } from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';

import {
  MailPreferencesTokenDto,
  UpdateMailPreferencesDto,
} from './dto/mail-preferences.dto.js';
import { MailPreferencesService } from './mail-preferences.service.js';

// Públicas (sin sesión, ver app.module): se abren desde el enlace del correo.
// POST para que el token no quede en los logs de acceso; el límite por IP
// frena intentos de adivinar tokens.
const PREFERENCES_LIMIT = { auth: { limit: 20, ttl: 60_000 } };

@Controller('mail-preferences')
@UseGuards(ThrottlerGuard)
@Throttle(PREFERENCES_LIMIT)
export class MailPreferencesController {
  constructor(private readonly mailPreferences: MailPreferencesService) {}

  @Post('/lookup')
  @HttpCode(200)
  find(@Body() { unsubscribeToken }: MailPreferencesTokenDto) {
    return this.mailPreferences.find(unsubscribeToken);
  }

  @Post()
  @HttpCode(200)
  update(
    @Body() { unsubscribeToken, plantNotifications }: UpdateMailPreferencesDto,
  ) {
    return this.mailPreferences.update(unsubscribeToken, plantNotifications);
  }
}
