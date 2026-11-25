import { NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import {
  type RepositoryMock,
  createServiceTestingModule,
} from '../../test/utils/index.js';
import { createUnsubscribeToken } from '../mail/unsubscribe-token.js';
import { User } from './entities/user.entity.js';
import {
  MailPreferencesService,
  maskEmail,
} from './mail-preferences.service.js';

const SECRET = 'secreto';

describe('MailPreferencesService', () => {
  let service: MailPreferencesService;
  let users: RepositoryMock<User>;
  const token = createUnsubscribeToken(7, SECRET);

  beforeEach(async () => {
    const testing = await createServiceTestingModule(MailPreferencesService, {
      repositories: [User],
      providers: [
        {
          provide: ConfigService,
          useValue: {
            get: (key: string) => ({ 'jwt.secretKey': SECRET })[key],
          },
        },
      ],
    });
    service = testing.service;
    users = testing.repository(User);
    users.findOne.mockResolvedValue({
      id: 7,
      email: 'persona@planta.com',
      plantNotifications: true,
    } as User);
  });

  it('con el token muestra el correo enmascarado y la preferencia', async () => {
    await expect(service.find(token)).resolves.toEqual({
      email: 'p••••••@planta.com',
      plantNotifications: true,
    });
    // Solo usuarios activos y solo los campos necesarios.
    expect(users.findOne).toHaveBeenCalledWith({
      where: { id: 7, isActive: true },
      select: { id: true, email: true, plantNotifications: true },
    });
  });

  it.each([false, true])(
    'cambia solo la casilla de ese usuario a %s',
    async (plantNotifications) => {
      await expect(service.update(token, plantNotifications)).resolves.toEqual({
        email: 'p••••••@planta.com',
        plantNotifications,
      });
      expect(users.update).toHaveBeenCalledWith(7, { plantNotifications });
    },
  );

  it('un token alterado responde 404 sin consultar la base', async () => {
    await expect(
      service.update(`8.${token.split('.')[1]}`, false),
    ).rejects.toThrow(
      new NotFoundException(
        'El enlace no es válido o la cuenta ya no está activa.',
      ),
    );
    expect(users.findOne).not.toHaveBeenCalled();
    expect(users.update).not.toHaveBeenCalled();
  });

  it('un usuario desactivado o inexistente responde 404 y no cambia nada', async () => {
    users.findOne.mockResolvedValue(null);

    await expect(service.update(token, false)).rejects.toThrow(
      NotFoundException,
    );
    expect(users.update).not.toHaveBeenCalled();
  });

  it('con la sesión muestra y cambia la casilla del usuario activo', async () => {
    await expect(service.findForUser(7)).resolves.toEqual({
      email: 'p••••••@planta.com',
      plantNotifications: true,
    });
    await expect(service.updateForUser(7, false)).resolves.toEqual({
      email: 'p••••••@planta.com',
      plantNotifications: false,
    });
    expect(users.findOne).toHaveBeenCalledWith({
      where: { id: 7, isActive: true },
      select: { id: true, email: true, plantNotifications: true },
    });
    expect(users.update).toHaveBeenCalledWith(7, { plantNotifications: false });
  });

  it('con la sesión de un usuario desactivado responde 404 y no cambia nada', async () => {
    users.findOne.mockResolvedValue(null);

    await expect(service.updateForUser(7, false)).rejects.toThrow(
      NotFoundException,
    );
    expect(users.update).not.toHaveBeenCalled();
  });

  it.each([
    ['persona@planta.com', 'p••••••@planta.com'],
    ['ab@x.com', 'a•••@x.com'],
    ['nombre.muy.largo.de.persona@x.com', 'n••••••••@x.com'],
    ['sin-arroba', '•••'],
    ['@x.com', '•••'],
  ])('enmascara %s como %s', (email, masked) => {
    expect(maskEmail(email)).toBe(masked);
  });
});
