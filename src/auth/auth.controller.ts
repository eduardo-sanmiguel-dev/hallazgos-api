import { Controller, Post, Body, Res } from '@nestjs/common';

import { parse } from 'cookie';
import { Response } from 'express';

import { AuthService } from './auth.service';
import { LoginAuthDto } from './dto/login-auth.dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('/login')
  async login(@Body() loginAuthDto: LoginAuthDto, @Res() response: Response) {
    const serializedCookie = await this.authService.login(loginAuthDto);
    const token = parse(serializedCookie).token || '';

    response.setHeader('Set-Cookie', serializedCookie);

    return response.json({ message: 'Inicio de sesión correctamente.', token });
  }

  @Post('/login-restore-password')
  async loginRestorePassword(
    @Body() loginAuthDto: LoginAuthDto,
    @Res() response: Response,
  ) {
    const serializedCookie =
      await this.authService.loginRestorePassword(loginAuthDto);
    const token = parse(serializedCookie).token || '';

    response.setHeader('Set-Cookie', serializedCookie);

    return response.json({ message: 'Inicio de sesión correctamente.', token });
  }

  @Post('/forgot-password')
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

  @Post('/check-token-restore-password')
  checkTokenRestorePassword(@Body('token') token: string) {
    return this.authService.checkTokenRestorePassword(token);
  }
}
