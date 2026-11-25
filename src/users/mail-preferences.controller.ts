import {
  Body,
  Controller,
  Get,
  HttpCode,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';

import { RequestContextService } from '../shared/services/request-context.service.js';
import {
  MailPreferencesTokenDto,
  UpdateMailPreferencesDto,
  UpdateOwnMailPreferencesDto,
} from './dto/mail-preferences.dto.js';
import { MailPreferencesService } from './mail-preferences.service.js';

// Las de token son públicas (sin sesión, ver app.module): se abren desde el
// enlace de correos anteriores. POST para que el token no quede en los logs
// de acceso; el límite por IP frena intentos de adivinar tokens. Las de "me"
// piden sesión: el enlace actual de los correos no lleva token.
const PREFERENCES_LIMIT = { auth: { limit: 20, ttl: 60_000 } };

@Controller('mail-preferences')
@UseGuards(ThrottlerGuard)
@Throttle(PREFERENCES_LIMIT)
export class MailPreferencesController {
  constructor(
    private readonly mailPreferences: MailPreferencesService,
    private readonly requestContext: RequestContextService,
  ) {}

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

  @Get('/me')
  findOwn() {
    return this.mailPreferences.findForUser(this.requestContext.userId);
  }

  @Patch('/me')
  updateOwn(@Body() { plantNotifications }: UpdateOwnMailPreferencesDto) {
    return this.mailPreferences.updateForUser(
      this.requestContext.userId,
      plantNotifications,
    );
  }
}
