import { Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import * as argon2 from 'argon2';
import { parseCookie } from 'cookie';
import * as jwt from 'jsonwebtoken';

import { ENV_DEVELOPMENT, ENV_PRODUCTION } from '@shared/constants';
import {
  buildManufacturingPlant,
  buildUser,
  createServiceTestingModule,
  mockProvider,
  RepositoryMock,
  runInRequest,
} from '@test/utils';
import { MailService } from 'mail/mail.service';
import { User } from 'users/entities/user.entity';
import { AuthService } from './auth.service';
import { JwtService, TOKEN_PURPOSE } from './jwt.service';

const SECRET = 'secreto-de-pruebas';
const THIRTY_DAYS_SECONDS = 60 * 60 * 24 * 30;
const INVALID_RESET_TOKEN =
  'El enlace para restablecer la contraseña no es válido o ya venció. Solicite uno nuevo.';
const FORGOT_PASSWORD_MESSAGE =
  'Si el correo está registrado, recibirá un enlace para restablecer su contraseña. Revise su bandeja de entrada.';

describe('AuthService', () => {
  let service: AuthService;
  let users: RepositoryMock<User>;
  let mail: jest.Mocked<MailService>;
  let jwtService: JwtService;
  let passwordHash: string;
  // "Tabla" de usuarios: findOne busca por email o id (y activos);
  // update guarda la contraseña nueva, como haría la base.
  let table: User[];

  const setup = async (environment = ENV_PRODUCTION) => {
    const config = {
      get: (key: string) =>
        ({ environment, 'jwt.secretKey': SECRET })[key] as string,
    };
    const testing = await createServiceTestingModule(AuthService, {
      repositories: [User],
      providers: [
        JwtService,
        { provide: ConfigService, useValue: config },
        mockProvider(MailService),
      ],
    });
    service = testing.service;
    users = testing.repository(User);
    mail = testing.get(MailService);
    mail.sendForgotPassword.mockResolvedValue(undefined);
    jwtService = testing.moduleRef.get(JwtService);

    users.findOne.mockImplementation(async ({ where }) => {
      const { email, id, isActive } = where as Partial<User>;
      return (
        table.find(
          (u) =>
            (email === undefined || u.email === email) &&
            (id === undefined || u.id === id) &&
            (isActive === undefined || u.isActive === isActive),
        ) ?? null
      );
    });
    users.update.mockImplementation(async (criteria, data) => {
      const { id, password, isActive } = criteria as Partial<User>;
      const user = table.find(
        (u) =>
          u.id === id && u.password === password && u.isActive === isActive,
      );
      if (!user) return { affected: 0, raw: [], generatedMaps: [] };
      Object.assign(user, data);
      return { affected: 1, raw: [], generatedMaps: [] };
    });
  };

  const person = (overrides: Partial<User> = {}) =>
    buildUser({
      id: 7,
      email: 'persona@hallazgos.test',
      password: passwordHash,
      manufacturingPlants: [buildManufacturingPlant()],
      ...overrides,
    });

  const tokenFromCookie = (cookie: string) => parseCookie(cookie).token;
  const currentHashOf = (id: number) => table.find((u) => u.id === id).password;

  beforeAll(async () => {
    passwordHash = await argon2.hash('Clave-correcta-1');
  });

  beforeEach(async () => {
    table = [person(), person({ id: 8, email: 'otra@hallazgos.test' })];
    await setup();
  });

  describe('login', () => {
    const login = (email: string, password: string) =>
      service.login({ email, password });

    it('devuelve una cookie con un token de sesión del usuario', async () => {
      const cookie = await login('persona@hallazgos.test', 'Clave-correcta-1');

      const payload = jwtService.verify(tokenFromCookie(cookie));
      expect(payload.userId).toBe(7);
      expect(payload.purpose).toBe(TOKEN_PURPOSE.session);
    });

    it('la cookie de sesión dura 30 días, igual que el token', async () => {
      const cookie = await login('persona@hallazgos.test', 'Clave-correcta-1');

      expect(cookie).toContain(`Max-Age=${THIRTY_DAYS_SECONDS};`);
    });

    it('en producción la cookie es segura, cross-site y del dominio comportarte.com', async () => {
      const cookie = await login('persona@hallazgos.test', 'Clave-correcta-1');

      expect(cookie).toContain('HttpOnly');
      expect(cookie).toContain('Secure');
      expect(cookie).toContain('SameSite=None');
      expect(cookie).toContain('Domain=comportarte.com');
      expect(cookie).toContain('Path=/');
      // Texto exacto (atributos y orden): el front depende de esta cookie.
      expect(cookie.replace(/^token=[^;]+/, 'token=<jwt>')).toBe(
        'token=<jwt>; Max-Age=2592000; Domain=comportarte.com; Path=/; HttpOnly; Secure; SameSite=None',
      );
    });

    it('en desarrollo la cookie no es segura y es de localhost', async () => {
      await setup(ENV_DEVELOPMENT);

      const cookie = await login('persona@hallazgos.test', 'Clave-correcta-1');

      expect(cookie).toContain('HttpOnly');
      expect(cookie).not.toContain('Secure');
      expect(cookie).toContain('SameSite=Lax');
      expect(cookie).toContain('Domain=localhost');
      expect(cookie.replace(/^token=[^;]+/, 'token=<jwt>')).toBe(
        'token=<jwt>; Max-Age=2592000; Domain=localhost; Path=/; HttpOnly; SameSite=Lax',
      );
    });

    it('responde el mismo 401 si el correo no existe que si la contraseña es incorrecta', async () => {
      await expect(
        login('nadie@hallazgos.test', 'Clave-correcta-1'),
      ).rejects.toThrow(new UnauthorizedException('Credenciales no válidas'));
      await expect(
        login('persona@hallazgos.test', 'Clave-incorrecta'),
      ).rejects.toThrow(new UnauthorizedException('Credenciales no válidas'));
    });

    it('un usuario inactivo no puede iniciar sesión (mismo 401 genérico)', async () => {
      table = [person({ isActive: false })];

      await expect(
        login('persona@hallazgos.test', 'Clave-correcta-1'),
      ).rejects.toThrow(new UnauthorizedException('Credenciales no válidas'));
    });

    it('con la contraseña correcta avisa si el usuario no tiene plantas', async () => {
      table = [person({ manufacturingPlants: [] })];

      await expect(
        login('persona@hallazgos.test', 'Clave-correcta-1'),
      ).rejects.toThrow(
        new UnauthorizedException('Usuario no tiene plantas asignadas'),
      );
    });

    it('sin la contraseña correcta no revela que al usuario le faltan plantas', async () => {
      table = [person({ manufacturingPlants: [] })];

      await expect(
        login('persona@hallazgos.test', 'Clave-incorrecta'),
      ).rejects.toThrow(new UnauthorizedException('Credenciales no válidas'));
    });
  });

  describe('loginRestorePassword', () => {
    const resetTokenFor = (id: number) =>
      jwtService.createResetToken(id, currentHashOf(id));
    const restore = (token: string, email = 'persona@hallazgos.test') =>
      service.loginRestorePassword({
        email,
        password: 'Nueva-clave-2',
        token,
      });

    it('con el token del correo guarda la nueva contraseña (hasheada) e inicia sesión', async () => {
      const cookie = await restore(resetTokenFor(7));

      const saved = currentHashOf(7);
      expect(saved).not.toBe('Nueva-clave-2');
      await expect(argon2.verify(saved, 'Nueva-clave-2')).resolves.toBe(true);
      expect(jwtService.verify(tokenFromCookie(cookie)).userId).toBe(7);
    });

    it('solo una solicitud simultánea puede usar el mismo token de recuperación', async () => {
      const token = resetTokenFor(7);
      const results = await Promise.allSettled([
        restore(token),
        restore(token),
      ]);
      expect(
        results.filter((result) => result.status === 'fulfilled'),
      ).toHaveLength(1);
      const rejected = results.find(
        (result) => result.status === 'rejected',
      ) as PromiseRejectedResult;
      expect(rejected.reason).toBeInstanceOf(UnauthorizedException);
      expect(users.update).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 7,
          isActive: true,
          password: passwordHash,
        }),
        expect.any(Object),
      );
    });

    it('no emite sesión si falla la escritura de la nueva contraseña', async () => {
      const create = jest.spyOn(jwtService, 'create');
      users.update.mockRejectedValueOnce(new Error('escritura fallida'));
      await expect(restore(resetTokenFor(7))).rejects.toThrow(
        'escritura fallida',
      );
      expect(create).not.toHaveBeenCalled();
      expect(currentHashOf(7)).toBe(passwordHash);
    });

    it('el correo se compara sin importar mayúsculas ni espacios', async () => {
      await expect(
        restore(resetTokenFor(7), '  Persona@Hallazgos.TEST '),
      ).resolves.toContain('token=');
    });

    it('debe exigir un token de recuperación válido para cambiar la contraseña', async () => {
      await expect(restore(undefined)).rejects.toThrow(
        new UnauthorizedException(INVALID_RESET_TOKEN),
      );
      await expect(restore('no-es-un-jwt')).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
      expect(users.update).not.toHaveBeenCalled();
    });

    it('un token ya usado no sirve otra vez (la contraseña cambió)', async () => {
      const token = resetTokenFor(7);
      await restore(token);
      users.update.mockClear();

      await expect(restore(token)).rejects.toThrow(
        new UnauthorizedException(INVALID_RESET_TOKEN),
      );
      expect(users.update).not.toHaveBeenCalled();
    });

    it('el token de otro usuario no sirve para cambiar la contraseña de este correo', async () => {
      await expect(
        restore(resetTokenFor(8), 'persona@hallazgos.test'),
      ).rejects.toThrow(new UnauthorizedException(INVALID_RESET_TOKEN));
      expect(users.update).not.toHaveBeenCalled();
      await expect(
        argon2.verify(currentHashOf(7), 'Clave-correcta-1'),
      ).resolves.toBe(true);
    });

    it('un token vencido no sirve', async () => {
      const { pwd } = jwt.decode(resetTokenFor(7)) as jwt.JwtPayload;
      const expired = jwt.sign(
        { userId: 7, purpose: TOKEN_PURPOSE.reset, pwd },
        SECRET,
        { algorithm: 'HS256', expiresIn: -10 },
      );

      await expect(restore(expired)).rejects.toThrow(
        new UnauthorizedException(INVALID_RESET_TOKEN),
      );
      expect(users.update).not.toHaveBeenCalled();
    });

    it('un token de sesión no sirve como token de recuperación', async () => {
      await expect(restore(jwtService.create(7))).rejects.toThrow(
        new UnauthorizedException(INVALID_RESET_TOKEN),
      );
      expect(users.update).not.toHaveBeenCalled();
    });

    it('no cambia nada si el usuario del token ya no está activo', async () => {
      const token = resetTokenFor(7);
      table[0].isActive = false;

      await expect(restore(token)).rejects.toThrow(
        new UnauthorizedException(INVALID_RESET_TOKEN),
      );
      expect(users.update).not.toHaveBeenCalled();
    });

    it('no cambia nada si el usuario no tiene plantas', async () => {
      table[0].manufacturingPlants = [];

      await expect(restore(resetTokenFor(7))).rejects.toThrow(
        new UnauthorizedException('Usuario no tiene plantas asignadas'),
      );
      expect(users.update).not.toHaveBeenCalled();
    });
  });

  describe('logout', () => {
    it('devuelve la cookie vacía y vencida, con las mismas opciones', async () => {
      const cookie = await service.logout();

      expect(tokenFromCookie(cookie)).toBe('');
      expect(cookie).toContain('Max-Age=0');
      expect(cookie).toContain('Domain=comportarte.com');
      expect(cookie).toContain('HttpOnly');
      expect(cookie).toBe(
        'token=; Max-Age=0; Domain=comportarte.com; Path=/; HttpOnly; Secure; SameSite=None',
      );
    });
  });

  describe('forgotPassword', () => {
    it('envía al correo del usuario un token de recuperación válido por 5 minutos', async () => {
      const result = await service.forgotPassword('persona@hallazgos.test');

      expect(result).toEqual({ message: FORGOT_PASSWORD_MESSAGE });
      expect(mail.sendForgotPassword).toHaveBeenCalledWith(
        'persona@hallazgos.test',
        expect.any(String),
      );
      const [, token] = mail.sendForgotPassword.mock.calls[0];
      const payload = jwtService.verifyResetToken(token, currentHashOf(7));
      expect(payload.userId).toBe(7);
      expect(payload.exp - payload.iat).toBe(5 * 60);
    });

    it('en desarrollo envía el correo a la cuenta de pruebas', async () => {
      await setup(ENV_DEVELOPMENT);

      await service.forgotPassword('persona@hallazgos.test');

      expect(mail.sendForgotPassword).toHaveBeenCalledWith(
        'eduardo-266@hotmail.com',
        expect.any(String),
      );
    });

    it('responde lo mismo si el correo no existe, sin enviar nada', async () => {
      await expect(
        service.forgotPassword('nadie@hallazgos.test'),
      ).resolves.toEqual({ message: FORGOT_PASSWORD_MESSAGE });
      expect(mail.sendForgotPassword).not.toHaveBeenCalled();
    });

    it('si el correo no se puede enviar responde lo mismo y lo deja en el log', async () => {
      const logError = jest
        .spyOn(Logger.prototype, 'error')
        .mockImplementation();
      mail.sendForgotPassword.mockRejectedValue(new Error('SMTP caído'));

      await expect(
        service.forgotPassword('persona@hallazgos.test'),
      ).resolves.toEqual({ message: FORGOT_PASSWORD_MESSAGE });
      expect(logError).toHaveBeenCalledWith(
        expect.stringContaining('SMTP caído'),
      );
      logError.mockRestore();
    });
  });

  describe('checkToken', () => {
    const withAuthorization = <T>(authorization: string, fn: () => T) =>
      runInRequest({ headers: { authorization } }, fn);

    it('acepta un token de sesión vigente en el header Authorization', async () => {
      await expect(
        withAuthorization(`Bearer ${jwtService.create(7)}`, () =>
          service.checkToken(),
        ),
      ).resolves.toEqual({ message: 'Token válido.' });
    });

    it.each([
      ['inválido', 'Bearer no-es-un-jwt'],
      ['firmado con otra clave', `Bearer ${jwt.sign({ userId: 7 }, 'otra')}`],
      ['sin "Bearer"', 'abc'],
    ])(
      'debe lanzar UnauthorizedException con un token %s',
      async (_c, header) => {
        await expect(
          withAuthorization(header, () => service.checkToken()),
        ).rejects.toThrow(new UnauthorizedException('Token no válido'));
      },
    );

    it('un token de recuperación no sirve como sesión', async () => {
      const reset = jwtService.createResetToken(7, currentHashOf(7));

      await expect(
        withAuthorization(`Bearer ${reset}`, () => service.checkToken()),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('debe lanzar UnauthorizedException si no llega el header Authorization', async () => {
      await expect(
        runInRequest({ headers: {} }, () => service.checkToken()),
      ).rejects.toThrow(new UnauthorizedException('Token no válido'));
    });
  });

  describe('checkTokenRestorePassword', () => {
    it('acepta un token de recuperación vigente y sin usar', async () => {
      const token = jwtService.createResetToken(7, currentHashOf(7));

      await expect(service.checkTokenRestorePassword(token)).resolves.toEqual({
        message: 'Token de restablecimiento de contraseña válido.',
      });
    });

    it('debe rechazar un token de sesión normal', async () => {
      await expect(
        service.checkTokenRestorePassword(jwtService.create(7)),
      ).rejects.toThrow(new UnauthorizedException(INVALID_RESET_TOKEN));
    });

    it('debe rechazar un token ya usado (la contraseña cambió)', async () => {
      const token = jwtService.createResetToken(7, currentHashOf(7));
      table[0].password = await argon2.hash('Otra-clave-3');

      await expect(
        service.checkTokenRestorePassword(token),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('debe rechazar un token vencido', async () => {
      const expired = jwt.sign(
        { userId: 7, purpose: TOKEN_PURPOSE.reset, pwd: 'x' },
        SECRET,
        { algorithm: 'HS256', expiresIn: -10 },
      );

      await expect(
        service.checkTokenRestorePassword(expired),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('debe rechazar si no llega token', async () => {
      await expect(
        service.checkTokenRestorePassword(undefined),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });
  });
});
