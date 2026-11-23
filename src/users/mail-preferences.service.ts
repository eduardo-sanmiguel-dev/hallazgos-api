import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { verifyUnsubscribeToken } from '../mail/unsubscribe-token.js';
import { User } from './entities/user.entity.js';

export interface MailPreferences {
  /** Correo enmascarado: confirma la cuenta sin exponerla a quien tenga el enlace. */
  email: string;
  plantNotifications: boolean;
}

/** "persona@planta.com" → "p•••••@planta.com". */
export const maskEmail = (email: string) => {
  const at = email.lastIndexOf('@');
  if (at < 1) return '•••';
  return `${email[0]}${'•'.repeat(Math.min(Math.max(at - 1, 3), 8))}${email.slice(at)}`;
};

/**
 * Preferencia de avisos a toda la planta, desde el enlace del correo y sin
 * sesión: el token firmado identifica al usuario y solo permite ver o cambiar
 * esta casilla.
 */
@Injectable()
export class MailPreferencesService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly configService: ConfigService,
  ) {}

  private async userFor(token: string): Promise<User> {
    const userId = verifyUnsubscribeToken(
      token,
      this.configService.get<string>('jwt.secretKey'),
    );
    const user =
      userId &&
      (await this.userRepository.findOne({
        where: { id: userId, isActive: true },
        select: { id: true, email: true, plantNotifications: true },
      }));
    if (!user)
      throw new NotFoundException(
        'El enlace no es válido o la cuenta ya no está activa.',
      );
    return user;
  }

  private view(
    user: Pick<User, 'email' | 'plantNotifications'>,
  ): MailPreferences {
    return {
      email: maskEmail(user.email),
      plantNotifications: user.plantNotifications,
    };
  }

  async find(token: string): Promise<MailPreferences> {
    return this.view(await this.userFor(token));
  }

  async update(
    token: string,
    plantNotifications: boolean,
  ): Promise<MailPreferences> {
    const user = await this.userFor(token);
    // Solo la casilla: el resto del usuario (sesiones, plantas) no cambia.
    await this.userRepository.update(user.id, { plantNotifications });
    return this.view({ email: user.email, plantNotifications });
  }
}
