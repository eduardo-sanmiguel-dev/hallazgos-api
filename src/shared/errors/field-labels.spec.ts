import { readdirSync, statSync } from 'fs';
import { join } from 'path';

import { getMetadataStorage } from 'class-validator';

import { FIELD_LABELS } from './field-labels.js';

const SRC = join(__dirname, '..', '..');

const dtoFiles = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return dtoFiles(path);
    return /\.dto\.ts$/.test(name) ? [path] : [];
  });

interface StoredMetadata {
  propertyName: string;
  target: Function;
}

describe('Etiquetas de los campos validados', () => {
  it('todo campo con validación en un DTO tiene etiqueta legible', () => {
    // Carga todos los DTO (también las clases anidadas que no se exportan).
    for (const file of dtoFiles(SRC)) require(file);

    // `validationMetadatas` es privado: Map<clase, metadatos[]>.
    const storage = getMetadataStorage() as unknown as {
      validationMetadatas: Map<Function, StoredMetadata[]>;
    };
    const missing = new Set<string>();

    for (const metadatas of storage.validationMetadatas.values()) {
      for (const { propertyName, target } of metadatas) {
        if (!FIELD_LABELS[propertyName]) {
          missing.add(`${propertyName} (${target.name})`);
        }
      }
    }

    expect([...missing].sort()).toEqual([]);
    expect(storage.validationMetadatas.size).toBeGreaterThan(50);
  });
});
