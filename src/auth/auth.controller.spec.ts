import type { Response } from 'express';

import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

const COOKIE = 'token=abc.def.ghi; Max-Age=2592000; Path=/; HttpOnly';

const fakeResponse = () => {
  const response = {
    setHeader: jest.fn(),
    json: jest.fn((body) => body),
  };
  return response as unknown as jest.Mocked<Response> & typeof response;
};

describe('AuthController', () => {
  let controller: AuthController;
  let auth: jest.Mocked<AuthService>;

  // Se instancia directo: el ThrottlerGuard (límite de intentos) lo cubre
  // el e2e; aquí interesa qué hace cada método con la respuesta.
  beforeEach(() => {
    auth = {
      login: jest.fn(),
      loginRestorePassword: jest.fn(),
      logout: jest.fn(),
      forgotPassword: jest.fn(),
      checkToken: jest.fn(),
      checkTokenRestorePassword: jest.fn(),
    } as unknown as jest.Mocked<AuthService>;
    controller = new AuthController(auth);
  });

  it.each([
    ['login', 'login'],
    ['loginRestorePassword', 'loginRestorePassword'],
  ] as const)(
    '%s pone la cookie y devuelve el token en el cuerpo',
    async (method, serviceMethod) => {
      auth[serviceMethod].mockResolvedValue(COOKIE);
      const response = fakeResponse();

      const body = await controller[method](
        { email: 'persona@hallazgos.test', password: 'x', token: 't' },
        response,
      );

      expect(response.setHeader).toHaveBeenCalledWith('Set-Cookie', COOKIE);
      expect(body).toEqual({
        message: 'Inicio de sesión correctamente.',
        token: 'abc.def.ghi',
      });
    },
  );

  it('logout pone la cookie vacía', async () => {
    auth.logout.mockResolvedValue('token=; Max-Age=0; Path=/');
    const response = fakeResponse();

    const body = await controller.logout(response);

    expect(response.setHeader).toHaveBeenCalledWith(
      'Set-Cookie',
      'token=; Max-Age=0; Path=/',
    );
    expect(body).toEqual({ message: 'Sesión cerrada correctamente.' });
  });

  it('forgotPassword, checkToken y checkTokenRestorePassword devuelven lo que responde el servicio', async () => {
    auth.forgotPassword.mockResolvedValue({ message: 'enviado' });
    auth.checkToken.mockReturnValue({ message: 'Token válido.' });
    auth.checkTokenRestorePassword.mockResolvedValue({ message: 'ok' });

    await expect(
      controller.forgotPassword('persona@hallazgos.test'),
    ).resolves.toEqual({
      message: 'enviado',
    });
    expect(auth.forgotPassword).toHaveBeenCalledWith('persona@hallazgos.test');
    expect(controller.checkToken()).toEqual({ message: 'Token válido.' });
    await expect(controller.checkTokenRestorePassword('abc')).resolves.toEqual({
      message: 'ok',
    });
    expect(auth.checkTokenRestorePassword).toHaveBeenCalledWith('abc');
  });
});
