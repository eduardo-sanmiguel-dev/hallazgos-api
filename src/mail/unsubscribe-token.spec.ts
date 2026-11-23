import {
  createUnsubscribeToken,
  verifyUnsubscribeToken,
} from './unsubscribe-token.js';

const SECRET = 'secreto-de-prueba';

describe('Token del enlace de baja', () => {
  it('identifica al usuario con el que se firmó', () => {
    const token = createUnsubscribeToken(42, SECRET);

    expect(token).toMatch(/^42\.[\w-]{43}$/);
    expect(verifyUnsubscribeToken(token, SECRET)).toBe(42);
  });

  it('no sirve para otro usuario (no se puede cambiar el id)', () => {
    const [, signature] = createUnsubscribeToken(42, SECRET).split('.');

    expect(verifyUnsubscribeToken(`43.${signature}`, SECRET)).toBeNull();
  });

  it('deja de servir si cambia el secreto', () => {
    const token = createUnsubscribeToken(42, SECRET);

    expect(verifyUnsubscribeToken(token, 'otro-secreto')).toBeNull();
  });

  it.each([
    ['vacío', ''],
    ['sin firma', '42'],
    ['firma corta', '42.abc'],
    ['id cero', `0.${'a'.repeat(43)}`],
    ['id no numérico', `x.${'a'.repeat(43)}`],
    ['nulo', null],
  ])('rechaza un token %s', (_, token) => {
    expect(verifyUnsubscribeToken(token as string, SECRET)).toBeNull();
  });
});
