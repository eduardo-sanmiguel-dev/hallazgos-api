import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { CreateUserDto } from './create-user.dto.js';
import {
  MailPreferencesTokenDto,
  UpdateMailPreferencesDto,
} from './mail-preferences.dto.js';
import { QueryUserDto, USER_SORTABLE_COLUMNS } from './query-user.dto.js';
import { UpdateUserDto } from './update-user.dto.js';

/** Propiedades con error, validando como lo hace el ValidationPipe global. */
const invalidFields = async <T extends object>(
  dto: new () => T,
  body: object,
) => {
  const errors = await validate(plainToInstance(dto, body), {
    whitelist: true,
    forbidNonWhitelisted: true,
  });
  return errors.map(({ property }) => property);
};

const validUser = {
  name: 'Nueva Persona',
  email: 'nueva@hallazgos.test',
  password: 'Clave-inicial-1',
  rule: 'General',
  manufacturingPlantNames: ['Tepotzotlán'],
};

describe('DTOs de usuarios', () => {
  describe('CreateUserDto', () => {
    it('acepta un alta completa', async () => {
      await expect(invalidFields(CreateUserDto, validUser)).resolves.toEqual(
        [],
      );
    });

    it.each([true, false])(
      'acepta plantNotifications %s (al crear y al editar)',
      async (plantNotifications) => {
        await expect(
          invalidFields(CreateUserDto, { ...validUser, plantNotifications }),
        ).resolves.toEqual([]);
        await expect(
          invalidFields(UpdateUserDto, { ...validUser, plantNotifications }),
        ).resolves.toEqual([]);
      },
    );

    it('responde 400 si plantNotifications no es booleano', async () => {
      await expect(
        invalidFields(CreateUserDto, {
          ...validUser,
          plantNotifications: 'no',
        }),
      ).resolves.toEqual(['plantNotifications']);
    });

    it.each([
      ['sin contraseña', { password: undefined }],
      ['con contraseña vacía', { password: '' }],
    ])('responde 400 %s', async (_c, override) => {
      await expect(
        invalidFields(CreateUserDto, { ...validUser, ...override }),
      ).resolves.toEqual(['password']);
    });

    it('responde 400 sin plantas', async () => {
      await expect(
        invalidFields(CreateUserDto, {
          ...validUser,
          manufacturingPlantNames: [],
        }),
      ).resolves.toEqual(['manufacturingPlantNames']);
    });
  });

  describe('UpdateUserDto', () => {
    it('la contraseña es opcional al editar', async () => {
      const { password: _omit, ...withoutPassword } = validUser;

      await expect(
        invalidFields(UpdateUserDto, withoutPassword),
      ).resolves.toEqual([]);
    });

    // El formulario de usuarios del UI manda `password: ""` al editar sin
    // cambiar la contraseña.
    it('al editar, una contraseña vacía se trata como "sin contraseña"', async () => {
      await expect(
        invalidFields(UpdateUserDto, { ...validUser, password: '' }),
      ).resolves.toEqual([]);
      expect(
        plainToInstance(UpdateUserDto, { ...validUser, password: '' }).password,
      ).toBeUndefined();
    });

    it('al editar, una contraseña con texto se valida y se conserva', async () => {
      await expect(
        invalidFields(UpdateUserDto, { ...validUser, password: 123 }),
      ).resolves.toEqual(['password']);
      expect(
        plainToInstance(UpdateUserDto, { ...validUser, password: 'Nueva-1' })
          .password,
      ).toBe('Nueva-1');
    });

    it.each([
      ['sin plantas', { manufacturingPlantNames: undefined }],
      ['con la lista de plantas vacía', { manufacturingPlantNames: [] }],
    ])('responde 400 %s', async (_c, override) => {
      await expect(
        invalidFields(UpdateUserDto, { ...validUser, ...override }),
      ).resolves.toEqual(['manufacturingPlantNames']);
    });
  });

  describe('QueryUserDto.orderBy', () => {
    it.each(
      USER_SORTABLE_COLUMNS.flatMap((column) => [
        column,
        `${column}|asc`,
        `${column}|DESC`,
      ]),
    )('acepta %s', async (orderBy) => {
      await expect(invalidFields(QueryUserDto, { orderBy })).resolves.toEqual(
        [],
      );
    });

    it.each([
      ['con una dirección inválida', 'name|up'],
      ['con una columna no permitida', 'password|asc'],
      ['con texto extra', 'name|asc; DROP TABLE "user"'],
      ['con un campo inexistente', 'nombre|asc'],
      ['vacío de columna', '|asc'],
    ])('responde 400 %s', async (_c, orderBy) => {
      await expect(invalidFields(QueryUserDto, { orderBy })).resolves.toEqual([
        'orderBy',
      ]);
    });
  });

  describe('QueryUserDto.order', () => {
    it.each(['asc', 'desc'])('acepta %s', async (order) => {
      await expect(invalidFields(QueryUserDto, { order })).resolves.toEqual([]);
    });

    it('responde 400 con otra dirección', async () => {
      await expect(
        invalidFields(QueryUserDto, { order: 'up' }),
      ).resolves.toEqual(['order']);
    });
  });

  describe('QueryUserDto.zoneIds y view', () => {
    it('lee zoneIds separados por coma o como arreglo', async () => {
      const fromComma = plainToInstance(QueryUserDto, { zoneIds: '3, 7' });
      const fromArray = plainToInstance(QueryUserDto, { zoneIds: ['3'] });

      expect(fromComma.zoneIds).toEqual(['3', '7']);
      expect(fromArray.zoneIds).toEqual(['3']);
      await expect(
        invalidFields(QueryUserDto, { zoneIds: '3,7', view: 'options' }),
      ).resolves.toEqual([]);
    });

    it.each([
      ['zoneIds con texto', { zoneIds: '3,abc' }, 'zoneIds'],
      ['zoneIds negativos', { zoneIds: '-3' }, 'zoneIds'],
      ['una view desconocida', { view: 'todo' }, 'view'],
    ])('responde 400 con %s', async (_c, query, field) => {
      await expect(invalidFields(QueryUserDto, query)).resolves.toEqual([
        field,
      ]);
    });
  });

  describe('preferencias de correo (enlace de baja)', () => {
    it('acepta el token y la casilla', async () => {
      await expect(
        invalidFields(UpdateMailPreferencesDto, {
          unsubscribeToken: '7.abc',
          plantNotifications: false,
        }),
      ).resolves.toEqual([]);
      await expect(
        invalidFields(MailPreferencesTokenDto, { unsubscribeToken: '7.abc' }),
      ).resolves.toEqual([]);
    });

    it.each([
      ['sin token', { plantNotifications: false }, 'unsubscribeToken'],
      [
        'con un token demasiado largo',
        { unsubscribeToken: 'x'.repeat(101), plantNotifications: false },
        'unsubscribeToken',
      ],
      ['sin la casilla', { unsubscribeToken: '7.abc' }, 'plantNotifications'],
      [
        'con un campo de más',
        { unsubscribeToken: '7.abc', plantNotifications: true, userId: 3 },
        'userId',
      ],
    ])('responde 400 %s', async (_c, body, field) => {
      await expect(
        invalidFields(UpdateMailPreferencesDto, body),
      ).resolves.toEqual([field]);
    });
  });
});
