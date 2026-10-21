#!/usr/bin/env node
/*
 * Ejecuta las secciones de fix-epp-delivery-date.sql contra el entorno
 * indicado.
 *
 *   npm run fix:epp-delivery-date -- <dev|prod> <preview|apply|revert|status>
 *
 * - dev usa .env.development y solo acepta un host local.
 * - prod usa .env.production; antes de apply o revert muestra la base
 *   conectada y la consulta previa, y pide escribir el nombre de la base.
 * - Las credenciales se leen del .env en tiempo de ejecución y nunca se
 *   imprimen.
 */
import fs from 'fs';
import path from 'path';
import readline from 'readline';
import pg from 'pg';

const { Client, types } = pg;

// Las columnas `date` se muestran tal cual (sin convertir a la zona local).
types.setTypeParser(1082, (value) => value);

const ROOT = path.resolve(import.meta.dirname, '..', '..');
const SQL_FILE = path.join(import.meta.dirname, 'fix-epp-delivery-date.sql');
const ENV_FILES = { dev: '.env.development', prod: '.env.production' };
const ACTIONS = ['preview', 'apply', 'revert', 'status'];
const LOCAL_HOSTS = ['localhost', '127.0.0.1', '::1'];
const BACKUP_TABLE = 'public.epp_equipment_delivery_date_backup';

const usage = () => {
  console.error(
    'Uso: npm run fix:epp-delivery-date -- <dev|prod> <preview|apply|revert|status>',
  );
  process.exit(1);
};

const readEnv = (file) => {
  const fullPath = path.join(ROOT, file);
  if (!fs.existsSync(fullPath)) {
    console.error(`No existe ${file} en ${ROOT}.`);
    process.exit(1);
  }

  return Object.fromEntries(
    fs
      .readFileSync(fullPath, 'utf8')
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#') && line.includes('='))
      .map((line) => {
        const i = line.indexOf('=');
        const value = line
          .slice(i + 1)
          .trim()
          .replace(/^["']|["']$/g, '');
        return [line.slice(0, i).trim(), value];
      }),
  );
};

// Secciones del .sql: cada una empieza con "-- @@ <nombre>".
const readSections = () => {
  const sections = {};
  let current = null;

  for (const line of fs.readFileSync(SQL_FILE, 'utf8').split(/\r?\n/)) {
    const marker = line.match(/^-- @@ (\w+)\s*$/);
    if (marker) {
      current = marker[1];
      sections[current] = [];
    } else if (current) {
      sections[current].push(line);
    }
  }

  return Object.fromEntries(
    Object.entries(sections).map(([name, lines]) => [name, lines.join('\n')]),
  );
};

const printResults = (results, titles = []) => {
  const list = Array.isArray(results) ? results : [results];
  list
    .filter((result) => result.command === 'SELECT')
    .forEach((result, index) => {
      if (titles[index]) console.log(`\n${titles[index]}`);
      if (result.rows.length) console.table(result.rows);
      else console.log('(sin filas)');
    });
};

const ask = (question) =>
  new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });

const backupExists = async (client) => {
  const { rows } = await client.query(
    'SELECT to_regclass($1) IS NOT NULL AS existe',
    [BACKUP_TABLE],
  );
  return rows[0].existe;
};

const readOnly = async (client, sql) => {
  await client.query('BEGIN READ ONLY');
  try {
    return await client.query(sql);
  } finally {
    await client.query('ROLLBACK');
  }
};

const preview = async (client, sections) => {
  const results = await readOnly(client, sections.preview);
  printResults(results, [
    'Resumen por país:',
    'Muestra (hasta 20 filas que cambiarían, fecha actual → fecha nueva):',
  ]);
};

const status = async (client, sections) => {
  if (!(await backupExists(client))) {
    console.log(
      '\nRespaldo: la tabla de respaldo no existe (no se ha aplicado la corrección).',
    );
    return;
  }
  const results = await readOnly(client, sections.status);
  printResults(results, ['Estado del respaldo:']);
};

const confirmProd = async (database) => {
  const answer = await ask(
    `\nVa a modificar datos en la base "${database}". Escriba el nombre de la base para continuar: `,
  );
  if (answer !== database) {
    console.log('El nombre no coincide. No se modificó nada.');
    return false;
  }
  return true;
};

// apply: filas del UPDATE. revert: el UPDATE va en un CTE y cada fila
// restaurada borra su respaldo, así que se cuentan las del DELETE.
const affectedRows = (results, command) =>
  (Array.isArray(results) ? results : [results])
    .filter((result) => result.command === command)
    .reduce((total, result) => total + (result.rowCount ?? 0), 0);

const main = async () => {
  const [envName, action] = process.argv.slice(2);
  if (!ENV_FILES[envName] || !ACTIONS.includes(action)) usage();

  const env = readEnv(ENV_FILES[envName]);
  const missing = [
    'DB_HOST',
    'DB_PORT',
    'DB_USERNAME',
    'DB_PASSWORD',
    'DB_NAME',
  ].filter((key) => !env[key]);
  if (missing.length) {
    console.error(
      `Faltan variables en ${ENV_FILES[envName]}: ${missing.join(', ')}`,
    );
    process.exit(1);
  }

  if (envName === 'dev' && !LOCAL_HOSTS.includes(env.DB_HOST)) {
    console.error(
      `Abortado: con "dev" la base debe ser local, pero ${ENV_FILES.dev} apunta a otro host.`,
    );
    process.exit(1);
  }

  const sections = readSections();
  const client = new Client({
    host: env.DB_HOST,
    port: Number(env.DB_PORT),
    user: env.DB_USERNAME,
    password: env.DB_PASSWORD,
    database: env.DB_NAME,
  });

  try {
    await client.connect();
  } catch (error) {
    // Sin el mensaje del driver: puede incluir host o usuario del .env.
    console.error(
      `No se pudo conectar a la base de ${envName} (código ${error.code ?? 'desconocido'}). Revise ${ENV_FILES[envName]}.`,
    );
    process.exit(1);
  }

  try {
    const {
      rows: [{ database }],
    } = await client.query('SELECT current_database() AS database');
    console.log(
      `Entorno: ${envName} | Base conectada: ${database} | Acción: ${action}`,
    );

    if (action === 'preview') {
      await preview(client, sections);
      await status(client, sections);
      return;
    }

    if (action === 'status') {
      await status(client, sections);
      return;
    }

    if (action === 'apply') {
      await preview(client, sections);
    } else {
      await status(client, sections);
    }

    if (envName === 'prod' && !(await confirmProd(database))) return;

    const results = await client.query(sections[action]);
    console.log(
      action === 'apply'
        ? `\nCorrección aplicada: ${affectedRows(results, 'UPDATE')} filas actualizadas.`
        : `\nReversa aplicada: ${affectedRows(results, 'DELETE')} filas restauradas.`,
    );

    console.log('\nVerificación:');
    await preview(client, sections);
    await status(client, sections);
  } catch (error) {
    // apply y revert corren en una transacción: si falló, no quedó nada.
    await client.query('ROLLBACK').catch(() => undefined);
    console.error(`\nError: ${error.message}. No se aplicaron cambios.`);
    process.exitCode = 1;
  } finally {
    await client.end();
  }
};

main();
