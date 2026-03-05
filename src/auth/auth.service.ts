import {
  Inject,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { REQUEST } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';

import { serialize } from 'cookie';
import { Repository } from 'typeorm';
import * as argon2 from 'argon2';
import { Request } from 'express';

import { ENV_DEVELOPMENT, ENV_PRODUCTION } from '@shared/constants';
import { User } from 'users/entities/user.entity';
import { LoginAuthDto } from './dto/login-auth.dto';
import { JwtService } from './jwt.service';
import { MailService } from 'mail/mail.service';

@Injectable()
export class AuthService {
  nameCookie: string;
  environment: string;

  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly jwtService: JwtService,
    @Inject(REQUEST) private readonly request: Request,
    private readonly configService: ConfigService,
    private readonly mailService: MailService,
  ) {
    this.environment = this.configService.get<string>('environment');
    this.nameCookie = 'token';
  }

  get optsSerialize() {
    return {
      httpOnly: true,
      secure: this.environment === ENV_PRODUCTION,
      sameSite: this.environment === ENV_PRODUCTION ? 'none' : 'lax',
      path: '/',
      domain:
        this.environment === ENV_PRODUCTION ? 'comportarte.com' : 'localhost',
    };
  }

  async login(loginAuthDto: LoginAuthDto): Promise<string> {
    const { email, password } = loginAuthDto;

    const user = await this.userRepository.findOne({
      where: {
        email,
        isActive: true,
      },
      relations: ['manufacturingPlants'],
      select: {
        id: true,
        password: true,
      },
    });

    if (!user)
      throw new NotFoundException(`Usuario con email ${email} no encontrado`);

    if (!user.manufacturingPlants.length)
      throw new UnauthorizedException('Usuario no tiene plantas asignadas');

    if (!(await argon2.verify(user.password, password))) {
      throw new UnauthorizedException('Credenciales no válidas');
    }

    const token = this.jwtService.create(user.id);

    const serialized = serialize(this.nameCookie, token, {
      ...this.optsSerialize,
      maxAge: 1000 * 60 * 60 * 24 * 30,
    });

    return serialized;
  }

  async loginRestorePassword(loginAuthDto: LoginAuthDto): Promise<string> {
    const { email, password } = loginAuthDto;

    const user = await this.userRepository.findOne({
      where: {
        email,
        isActive: true,
      },
      relations: ['manufacturingPlants'],
      select: {
        id: true,
        password: true,
      },
    });

    if (!user)
      throw new NotFoundException(`Usuario con email ${email} no encontrado`);

    if (!user.manufacturingPlants.length)
      throw new UnauthorizedException('Usuario no tiene plantas asignadas');

    await this.userRepository.update(user.id, {
      password: await argon2.hash(password),
    });

    const userUpdated = await this.userRepository.findOne({
      where: {
        id: user.id,
      },
      select: {
        id: true,
        password: true,
      },
    });

    if (!(await argon2.verify(userUpdated.password, password))) {
      throw new UnauthorizedException('Credenciales no válidas');
    }

    const token = this.jwtService.create(user.id);

    const serialized = serialize(this.nameCookie, token, {
      ...this.optsSerialize,
      maxAge: 1000 * 60 * 60 * 24 * 30,
    });

    return serialized;
  }

  async logout(): Promise<string> {
    const token = this.request['user'].token as string;

    const serialized = serialize(this.nameCookie, token, {
      ...this.optsSerialize,
      maxAge: 0,
    });

    return serialized;
  }

  async forgotPassword(email: string): Promise<{
    message: string;
  }> {
    const user = await this.userRepository.findOne({
      where: { email, isActive: true },
    });

    if (!user) {
      throw new NotFoundException(`Usuario con email ${email} no encontrado`);
    }
    const token = this.jwtService.create(user.id, true);

    if (process.env.NODE_ENV === ENV_DEVELOPMENT) {
      email = 'eduardo-266@hotmail.com';
    }

    await this.mailService.sendForgotPassword(email, token);

    return {
      message:
        'Se ha enviado un correo para restablecer su contraseña, por favor revise su bandeja de entrada.',
    };
  }

  checkToken(): {
    message: string;
  } {
    const token = this.request.headers['authorization'].split(' ')[1];
    try {
      this.jwtService.verify(token);
      return { message: 'Token válido.' };
    } catch (error) {
      throw new UnauthorizedException('Token no válido');
    }
  }

  checkTokenRestorePassword(token: string): {
    message: string;
  } {
    try {
      this.jwtService.verify(token);
      return { message: 'Token de restablecimiento de contraseña válido.' };
    } catch (error) {
      throw new UnauthorizedException('Token no válido');
    }
  }
}
