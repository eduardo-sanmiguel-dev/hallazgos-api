import * as argon2 from 'argon2';

/**
 * Compatibilidad de contraseñas entre versiones de argon2: las cuentas
 * existentes tienen hashes generados por versiones anteriores y deben seguir
 * entrando después de actualizar la librería.
 */
describe('argon2: hashes de versiones anteriores', () => {
  // Generado con argon2 0.40.3 (opciones por defecto, las que usa la app:
  // argon2id, v=19, m=65536, t=3, p=4).
  const HASH_0_40 =
    '$argon2id$v=19$m=65536,t=3,p=4$jpMzDrEJyBouWkew9CiNyA$4zsSXW9fe+JtPF3CkQzV7FsEYRjzsdODLycCAy9z3Bo';

  it('un hash de 0.40 verifica con la contraseña correcta', async () => {
    await expect(argon2.verify(HASH_0_40, 'Clave-Hash-0.40')).resolves.toBe(
      true,
    );
  });

  it('un hash de 0.40 rechaza otra contraseña', async () => {
    await expect(argon2.verify(HASH_0_40, 'otra')).resolves.toBe(false);
  });

  it('los hashes nuevos conservan algoritmo y parámetros', async () => {
    const hash = await argon2.hash('Clave-nueva-1');
    const [, algorithm, version, params] = hash.split('$');

    expect([algorithm, version]).toEqual(['argon2id', 'v=19']);
    // Desde 0.41 el orden de los parámetros en el texto es m,p,t: se comparan
    // los valores, no el orden.
    expect(params.split(',').sort()).toEqual(['m=65536', 'p=4', 't=3']);
  });
});
