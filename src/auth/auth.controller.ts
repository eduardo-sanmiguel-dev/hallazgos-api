import { Controller, Post, Body, Res, UseGuards } from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';

import { parseCookie } from 'cookie';
import type { Response } from 'express';

import { AuthService } from './auth.service';
import { LoginAuthDto } from './dto/login-auth.dto';
import { RestorePasswordDto } from './dto/restore-password.dto';

// Límite por IP en los endpoints públicos que reciben credenciales o
// correos: frena fuerza bruta y abuso del envío de correos.
const LOGIN_LIMIT = { auth: { limit: 10, ttl: 60_000 } };
const EMAIL_LIMIT = { auth: { limit: 5, ttl: 60_000 } };

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('/login')
  @UseGuards(ThrottlerGuard)
  @Throttle(LOGIN_LIMIT)
  async login(@Body() loginAuthDto: LoginAuthDto, @Res() response: Response) {
    const serializedCookie = await this.authService.login(loginAuthDto);
    const token = parseCookie(serializedCookie).token || '';

    response.setHeader('Set-Cookie', serializedCookie);

    return response.json({ message: 'Inicio de sesión correctamente.', token });
  }

  @Post('/login-restore-password')
  @UseGuards(ThrottlerGuard)
  @Throttle(LOGIN_LIMIT)
  async loginRestorePassword(
    @Body() restorePasswordDto: RestorePasswordDto,
    @Res() response: Response,
  ) {
    const serializedCookie =
      await this.authService.loginRestorePassword(restorePasswordDto);
    const token = parseCookie(serializedCookie).token || '';

    response.setHeader('Set-Cookie', serializedCookie);

    return response.json({ message: 'Inicio de sesión correctamente.', token });
  }

  @Post('/forgot-password')
  @UseGuards(ThrottlerGuard)
  @Throttle(EMAIL_LIMIT)
  async forgotPassword(@Body('email') email: string) {
    return this.authService.forgotPassword(email);
  }

  @Post('/logout')
  async logout(@Res() response: Response) {
    const token = await this.authService.logout();

    response.setHeader('Set-Cookie', token);

    return response.json({ message: 'Sesión cerrada correctamente.' });
  }

  @Post('/check-token')
  checkToken() {
    return this.authService.checkToken();
  }

  // Sin límite de intentos a propósito: el proxy de Next (proxy.ts) lo llama
  // desde el servidor, así que todas las peticiones llegan con la IP del
  // servidor y un límite por IP se repartiría entre todos los usuarios. No
  // hace falta: solo valida un token firmado (HMAC) que no se puede adivinar
  // por fuerza bruta y que es de un solo uso. El paso que cambia la
  // contraseña (login-restore-password) sí tiene límite y llega con la IP
  // real del navegador.
  @Post('/check-token-restore-password')
  checkTokenRestorePassword(@Body('token') token: string) {
    return this.authService.checkTokenRestorePassword(token);
  }
}
