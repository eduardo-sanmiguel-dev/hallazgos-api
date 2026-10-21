import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { RequestContextService } from 'shared/services/request-context.service';

import { stringifySetCookie } from 'cookie';
import { Repository } from 'typeorm';
import * as argon2 from 'argon2';

import { ENV_DEVELOPMENT, ENV_PRODUCTION } from '@shared/constants';
import { User } from 'users/entities/user.entity';
import { LoginAuthDto } from './dto/login-auth.dto';
import { RestorePasswordDto } from './dto/restore-password.dto';
import { JwtService } from './jwt.service';
import { MailService } from 'mail/mail.service';

// Vida de la cookie de sesión, en SEGUNDOS (como espera `cookie.serialize`);
// igual que la del token de sesión.
const SESSION_COOKIE_MAX_AGE = 60 * 60 * 24 * 30;

// Mismo mensaje exista o no el correo: no revela qué cuentas existen.
const INVALID_CREDENTIALS = 'Credenciales no válidas';
const FORGOT_PASSWORD_MESSAGE =
  'Si el correo está registrado, recibirá un enlace para restablecer su contraseña. Revise su bandeja de entrada.';
const INVALID_RESET_TOKEN =
  'El enlace para restablecer la contraseña no es válido o ya venció. Solicite uno nuevo.';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  nameCookie: string;
  environment: string;
  // Hash de relleno: si el correo no existe se verifica igual contra él, para
  // que el tiempo de respuesta no delate qué cuentas existen.
  private dummyHash: Promise<string>;

  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly jwtService: JwtService,
    private readonly requestContext: RequestContextService,
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
    } as const;
  }

  private sessionCookie(userId: number): string {
    return stringifySetCookie({
      name: this.nameCookie,
      value: this.jwtService.create(userId),
      ...this.optsSerialize,
      maxAge: SESSION_COOKIE_MAX_AGE,
    });
  }

  private findActiveUser(where: { email?: string; id?: number }) {
    return this.userRepository.findOne({
      where: { ...where, isActive: true },
      relations: ['manufacturingPlants'],
      select: { id: true, email: true, password: true },
    });
  }

  async login(loginAuthDto: LoginAuthDto): Promise<string> {
    const { email, password } = loginAuthDto;

    const user = await this.findActiveUser({ email });

    if (!user) {
      this.dummyHash ??= argon2.hash('contraseña-de-relleno');
      await argon2.verify(await this.dummyHash, password).catch(() => false);
      throw new UnauthorizedException(INVALID_CREDENTIALS);
    }

    if (!(await argon2.verify(user.password, password))) {
      throw new UnauthorizedException(INVALID_CREDENTIALS);
    }

    // Después de validar la contraseña: solo quien la conoce sabe si a la
    // cuenta le faltan plantas.
    if (!user.manufacturingPlants.length)
      throw new UnauthorizedException('Usuario no tiene plantas asignadas');

    return this.sessionCookie(user.id);
  }

  /**
   * Cambia la contraseña con el token del correo de recuperación. El token
   * debe ser de recuperación, estar vigente, ser del usuario del correo y no
   * haberse usado (deja de servir en cuanto cambia la contraseña).
   */
  async loginRestorePassword(
    restorePasswordDto: RestorePasswordDto,
  ): Promise<string> {
    const { email, password, token } = restorePasswordDto;

    const user = await this.userFromResetToken(token);

    if (
      !email ||
      user.email.trim().toLowerCase() !== email.trim().toLowerCase()
    ) {
      throw new UnauthorizedException(INVALID_RESET_TOKEN);
    }

    if (!user.manufacturingPlants.length)
      throw new UnauthorizedException('Usuario no tiene plantas asignadas');

    const previousHash = user.password;
    const nextHash = await argon2.hash(password);
    const { affected } = await this.userRepository.update(
      { id: user.id, password: previousHash, isActive: true },
      { password: nextHash },
    );
    if (affected !== 1) throw new UnauthorizedException(INVALID_RESET_TOKEN);

    this.logger.log(`Contraseña restablecida para el usuario ${user.id}`);

    return this.sessionCookie(user.id);
  }

  async logout(): Promise<string> {
    // Se borra la cookie (valor vacío y maxAge 0).
    return stringifySetCookie({
      name: this.nameCookie,
      value: '',
      ...this.optsSerialize,
      maxAge: 0,
    });
  }

  async forgotPassword(email: string): Promise<{
    message: string;
  }> {
    const user = await this.userRepository.findOne({
      where: { email, isActive: true },
      select: { id: true, email: true, password: true },
    });

    // Misma respuesta exista o no la cuenta.
    if (!user) return { message: FORGOT_PASSWORD_MESSAGE };

    const token = this.jwtService.createResetToken(user.id, user.password);

    if (this.environment === ENV_DEVELOPMENT) {
      email = 'eduardo-266@hotmail.com';
    }

    // Un fallo del correo tampoco cambia la respuesta (delataría la cuenta);
    // queda en el log.
    await this.mailService.sendForgotPassword(email, token).catch((error) => {
      this.logger.error(
        `No se pudo enviar el correo de recuperación al usuario ${user.id}: ${error?.message}`,
      );
    });

    return { message: FORGOT_PASSWORD_MESSAGE };
  }

  checkToken(): {
    message: string;
  } {
    const authorization = this.requestContext.request.headers['authorization'];
    const token = `${authorization ?? ''}`.split(' ')[1];

    if (!token) throw new UnauthorizedException('Token no válido');

    try {
      this.jwtService.verify(token);
      return { message: 'Token válido.' };
    } catch {
      throw new UnauthorizedException('Token no válido');
    }
  }

  async checkTokenRestorePassword(token: string): Promise<{
    message: string;
  }> {
    await this.userFromResetToken(token);
    return { message: 'Token de restablecimiento de contraseña válido.' };
  }

  /** Usuario activo dueño de un token de recuperación válido y sin usar. */
  private async userFromResetToken(token: string): Promise<User> {
    let userId: number;
    try {
      userId = this.jwtService.decodeResetToken(token).userId;
    } catch {
      throw new UnauthorizedException(INVALID_RESET_TOKEN);
    }

    const user = await this.findActiveUser({ id: userId });

    try {
      if (!user) throw new Error('Usuario no encontrado o inactivo');
      this.jwtService.verifyResetToken(token, user.password);
    } catch {
      throw new UnauthorizedException(INVALID_RESET_TOKEN);
    }

    return user;
  }
}
