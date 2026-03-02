import { join } from 'path';
import { existsSync, readFileSync } from 'fs';
import { DataSource } from 'typeorm';
import type { DataSourceOptions } from 'typeorm';
import type { SeederOptions } from 'typeorm-extension';

const envFilePath = join(
  process.cwd(),
  `.env.${process.env.NODE_ENV ?? 'development'}`,
);

if (existsSync(envFilePath)) {
  const envFileContent = readFileSync(envFilePath, 'utf8');
  envFileContent
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#') && line.includes('='))
    .forEach((line) => {
      const separatorIndex = line.indexOf('=');
      const key = line.slice(0, separatorIndex).trim();
      const value = line.slice(separatorIndex + 1).trim();

      if (!process.env[key]) {
        process.env[key] = value.replace(/^"|"$/g, '').replace(/^'|'$/g, '');
      }
    });
}

export default new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT),
  username: process.env.DB_USERNAME,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  synchronize: false,
  logging: false,
  entities: [join(process.cwd(), 'src', '**', 'entities', '*{.ts,.js}')],
  migrations: [join(process.cwd(), 'src', 'migrations', '*{.ts,.js}')],
  seeds: [join(process.cwd(), 'src', 'database', 'seeds', '*{.ts,.js}')],
  factories: [
    join(process.cwd(), 'src', 'database', 'factories', '*{.ts,.js}'),
  ],
} as DataSourceOptions & SeederOptions);
