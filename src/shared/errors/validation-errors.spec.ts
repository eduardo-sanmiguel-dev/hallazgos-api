import { BadRequestException, type Type } from '@nestjs/common';

import { CreateEmergencyTeamDto } from '../../emergency-teams/dto/create-emergency-team.dto.js';
import { CreateEvidenceDto } from '../../evidences/dto/create-evidence.dto.js';
import { CreateExtinguisherInspectionDto } from '../../extinguisher-inspections/dto/create-extinguisher-inspection.dto.js';
import { CreateUserDto } from '../../users/dto/create-user.dto.js';
import { createValidationPipe } from './validation-errors.js';

/** Cuerpo del 400 que respondería el ValidationPipe global. */
const validationBody = async (metatype: Type, value: object) => {
  const error = await createValidationPipe()
    .transform(value, { type: 'body', metatype })
    .then(() => undefined)
    .catch((caught: unknown) => caught);

  expect(error).toBeInstanceOf(BadRequestException);
  return (error as BadRequestException).getResponse() as {
    code: string;
    message: string;
    errors: Record<string, string>;
  };
};

const validEvaluation = {
  location: 'Pasillo norte',
  extinguisherNumber: 'EXT-01',
  typeOfExtinguisher: 'PQS',
  capacity: 6,
  pressureManometer: 'C',
  valve: 'C',
  hose: 'C',
  cylinder: 'C',
  barrette: 'C',
  seal: 'C',
  cornet: 'C',
  access: 'C',
  support: 'C',
  nextRechargeDate: '2027-01-15',
  maintenanceDate: '2026-10-01',
};

describe('Traductor de validaciones', () => {
  it('crear hallazgo sin zona: un solo mensaje por campo, "obligatorio" primero', async () => {
    const body = await validationBody(CreateEvidenceDto, {
      manufacturingPlantId: 1,
      type: 2,
      typeHallazgo: 3,
      process: 4,
    });

    expect(body).toEqual({
      code: 'VALIDATION_FAILED',
      message: 'Zona: dato obligatorio.',
      errors: { zone: 'Dato obligatorio.' },
    });
  });

  // La lista vacía llega como "sin plantas" (la transforma
  // parseStringArrayQueryByKey), así que gana "obligatorio" sobre el mínimo.
  it('crear usuario sin plantas: dato obligatorio', async () => {
    const body = await validationBody(CreateUserDto, {
      name: 'Ana',
      email: 'ana@hada.com',
      password: 'secreta',
      rule: 'General',
      manufacturingPlantNames: [],
    });

    expect(body.message).toBe('Plantas: dato obligatorio.');
    expect(body.errors).toEqual({
      manufacturingPlantNames: 'Dato obligatorio.',
    });
  });

  it('crear equipo de emergencia con varios errores: resumen con etiquetas y mensaje propio respetado', async () => {
    const body = await validationBody(CreateEmergencyTeamDto, {
      location: 'Ala',
      extinguisherNumber: 'EXT 01',
      typeOfExtinguisher: 'PQS',
      capacity: 0,
      manufacturingPlantId: 1,
    });

    expect(body.message).toBe(
      'Revisa 3 campos: Ubicación, Número de extintor y Capacidad.',
    );
    expect(body.errors).toEqual({
      location: 'Debe tener entre 5 y 150 caracteres.',
      extinguisherNumber: 'Solo puede tener letras, números y guiones.',
      capacity: 'Debe ser 1 o mayor.',
    });
  });

  it('campos dentro de una lista: ruta con índice y renglón contado desde 1', async () => {
    const body = await validationBody(CreateExtinguisherInspectionDto, {
      manufacturingPlantId: 1,
      evaluations: [validEvaluation, { ...validEvaluation, valve: 'X' }],
    });

    expect(body.errors).toEqual({
      'evaluations.1.valve': 'Elige una opción válida.',
    });
    expect(body.message).toBe('Válvula (renglón 2): elige una opción válida.');
  });

  it('una lista vacía se marca en el campo de la lista, sin índice y con el mínimo del decorador', async () => {
    const body = await validationBody(CreateExtinguisherInspectionDto, {
      manufacturingPlantId: 1,
      evaluations: [],
    });

    expect(body.errors).toEqual({ evaluations: 'Elige al menos 1.' });
  });

  it('un dato que el DTO no acepta (whitelist) se reporta con su nombre técnico', async () => {
    const body = await validationBody(CreateEvidenceDto, {
      manufacturingPlantId: 1,
      type: 2,
      typeHallazgo: 3,
      zone: 4,
      process: 5,
      colorFavorito: 'verde',
    });

    expect(body.errors).toEqual({ colorFavorito: 'Este dato no se acepta.' });
    expect(body.message).toBe('«colorFavorito»: este dato no se acepta.');
  });

  it('longitud solo con máximo y números con decimales', async () => {
    const body = await validationBody(CreateExtinguisherInspectionDto, {
      manufacturingPlantId: 1,
      evaluations: [
        {
          ...validEvaluation,
          observations: 'x'.repeat(501),
          capacity: 1.234,
        },
      ],
    });

    expect(body.errors).toEqual({
      'evaluations.0.observations': 'Debe tener máximo 500 caracteres.',
      'evaluations.0.capacity': 'Debe ser un número con máximo 2 decimales.',
    });
  });
});
