import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { CreateUserDto } from './create-user.dto.js';
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
        `${column}|asc`,
        `${column}|DESC`,
      ]),
    )('acepta %s', async (orderBy) => {
      await expect(invalidFields(QueryUserDto, { orderBy })).resolves.toEqual(
        [],
      );
    });

    it.each([
      ['sin dirección', 'name'],
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
});
