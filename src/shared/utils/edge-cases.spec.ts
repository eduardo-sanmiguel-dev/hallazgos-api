/**
 * Casos de borde de utilidades pequeñas (sin un spec propio o que no
 * encajan en el suyo): valores por omisión y fallos que solo se ignoran.
 */
import { BadRequestException } from '@nestjs/common';
import fsPromises from 'fs/promises';
import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import { countWrappedLines } from './excel-row-height.js';
import { sanitizeFileNamePart } from './file-name.js';
import { ImageFileValidationPipe, imageUploadOptions } from './image-upload.js';
import { calculateAge } from './index.js';
import { notifyProcessReady } from './process-ready.js';
import { parseStringArrayQueryByKey } from './query-string-array-transformer.util.js';
import { removeTempDir } from './temp-dir.js';
import {
  formatUtcOffsetLong,
  parseWallClock,
  wallClockToInstant,
} from './timezone.js';

afterEach(() => jest.restoreAllMocks());

describe('calculateAge', () => {
  beforeEach(() => {
    jest.useFakeTimers({ now: new Date(2026, 5, 15, 12) });
  });
  afterEach(() => jest.useRealTimers());

  it.each([
    ['ya cumplió este año (mes anterior)', new Date(1990, 2, 1), 36],
    ['cumple más adelante en el año', new Date(1990, 8, 1), 35],
    ['cumple más tarde en el mismo mes', new Date(1990, 5, 20), 35],
    ['cumplió antes en el mismo mes', new Date(1990, 5, 10), 36],
  ])('%s', (_c, birth, age) => {
    expect(calculateAge(birth)).toBe(age);
  });
});

it('countWrappedLines: una palabra más ancha que la columna tras otra empieza renglón', () => {
  const long = 'x'.repeat(60);

  expect(countWrappedLines(`a ${long}`, 10, 10)).toBeGreaterThan(
    countWrappedLines(long, 10, 10),
  );
});

it('sanitizeFileNamePart sin nombre usa "Archivo"', () => {
  expect(sanitizeFileNamePart('')).toBe('Archivo');
});

describe('image-upload', () => {
  it('el nombre lo genera el servidor: uuid, sufijo y extensión en minúsculas', () => {
    const storage = imageUploadOptions('evidence').storage as unknown as {
      getFilename: (
        req: unknown,
        file: { originalname: string },
        callback: (error: Error | null, name: string) => void,
      ) => void;
    };
    const callback = jest.fn();

    storage.getFilename({}, { originalname: 'Foto.PNG' }, callback);

    expect(callback).toHaveBeenCalledWith(
      null,
      expect.stringMatching(/^[0-9a-f-]{36}-evidence\.png$/),
    );
  });

  it('si no se puede borrar un archivo que no es imagen igual responde 400', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'image-pipe-'));
    const path = join(dir, 'falso.png');
    writeFileSync(path, '<html></html>');
    jest.spyOn(fsPromises, 'unlink').mockRejectedValue(new Error('EBUSY'));
    try {
      await expect(
        new ImageFileValidationPipe().transform({
          path,
        } as Express.Multer.File),
      ).rejects.toBeInstanceOf(BadRequestException);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

it('notifyProcessReady sin target avisa al proceso actual', () => {
  const previous = process.send;
  const send = jest.fn();
  process.send = send as never;
  try {
    notifyProcessReady();
  } finally {
    process.send = previous;
  }

  expect(send).toHaveBeenCalledWith('ready');
});

it('parseStringArrayQueryByKey sin objeto de origen no falla', () => {
  expect(
    parseStringArrayQueryByKey('ids')({
      value: undefined,
      obj: undefined,
    } as never),
  ).toBeUndefined();
});

it('removeTempDir ignora un fallo al borrar', async () => {
  jest.spyOn(fsPromises, 'rm').mockRejectedValue(new Error('EBUSY'));

  await expect(removeTempDir('/no/importa')).resolves.toBeUndefined();
});

describe('timezone', () => {
  it('una hora que no existe por el cambio de horario usa el desfase posterior', () => {
    // 2026-03-08 02:30 no existe en Nueva York (de 02:00 salta a 03:00).
    const instant = wallClockToInstant(
      { year: 2026, month: 3, day: 8, hour: 2, minute: 30, second: 0 },
      'America/New_York',
    );

    expect(instant.toISOString()).toBe('2026-03-08T06:30:00.000Z');
  });

  it('parseWallClock rechaza un formato inesperado', () => {
    expect(() => parseWallClock('08/03/2026')).toThrow(
      'Fecha sin zona con formato inesperado: "08/03/2026"',
    );
  });

  it('formatUtcOffsetLong con desfase positivo', () => {
    expect(formatUtcOffsetLong(330)).toBe('UTC+05:30');
  });
});
