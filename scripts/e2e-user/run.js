#!/usr/bin/env node
/*
 * Crea o actualiza el usuario de las pruebas e2e del UI, SOLO en la base de
 * desarrollo (.env.development con DB_HOST local).
 *
 *   E2E_EMAIL=... E2E_PASSWORD=... node scripts/e2e-user/run.js
 *
 * - Rol Administrador y acceso a todas las plantas (las pruebas recorren
 *   todos los módulos).
 * - No borra ni modifica ningún otro usuario.
 * - Las credenciales viven en hallazgos-ui/e2e/.env.e2e (ignorado por git).
 */
const { readFileSync } = require('fs');
const { join } = require('path');
const argon2 = require('argon2');
const { Client } = require('pg');

const ROLE_ADMINISTRADOR = 'Administrador';
const E2E_NAME = 'Usuario pruebas e2e';

const env = Object.fromEntries(
  readFileSync(join(__dirname, '..', '..', '.env.development'), 'utf8')
    .split(/\r?\n/)
    .filter((line) => /^[A-Z_]+=/.test(line))
    .map((line) => {
      const idx = line.indexOf('=');
      return [
        line.slice(0, idx),
        line.slice(idx + 1).replace(/^["']|["']$/g, ''),
      ];
    }),
);

const fail = (message) => {
  console.error(`Abortado: ${message}`);
  process.exit(1);
};

if (process.env.NODE_ENV === 'production') {
  fail('no se ejecuta con NODE_ENV=production.');
}
if (!['localhost', '127.0.0.1'].includes(env.DB_HOST)) {
  fail('DB_HOST de .env.development no es local.');
}

const email = process.env.E2E_EMAIL;
const password = process.env.E2E_PASSWORD;

if (!email || !/@hallazgos\.test$/.test(email)) {
  fail('E2E_EMAIL debe ser una cuenta @hallazgos.test.');
}
if (!password || password.length < 16) {
  fail('E2E_PASSWORD debe tener al menos 16 caracteres.');
}

(async () => {
  const client = new Client({
    host: env.DB_HOST,
    port: Number(env.DB_PORT),
    user: env.DB_USERNAME,
    password: env.DB_PASSWORD,
    database: env.DB_NAME,
  });
  await client.connect();

  try {
    await client.query('BEGIN');
    const hash = await argon2.hash(password);
    const {
      rows: [user],
    } = await client.query(
      `INSERT INTO "user" (name, email, password, role, "isActive")
       VALUES ($1, $2, $3, $4, true)
       ON CONFLICT (email) DO UPDATE
         SET password = EXCLUDED.password, role = EXCLUDED.role,
             "isActive" = true, "updatedAt" = now()
       RETURNING id, (xmax = 0) AS created`,
      [E2E_NAME, email, hash, ROLE_ADMINISTRADOR],
    );
    const { rowCount } = await client.query(
      `INSERT INTO user_manufacturing_plants ("userId", "manufacturingPlantId")
       SELECT $1, id FROM manufacturing_plant
       ON CONFLICT DO NOTHING`,
      [user.id],
    );
    await client.query('COMMIT');
    console.log(
      `Usuario e2e ${user.created ? 'creado' : 'actualizado'} (id ${user.id}); plantas agregadas: ${rowCount}.`,
    );
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    await client.end();
  }
})().catch((error) => {
  console.error('ERROR:', error.message);
  process.exit(1);
});
