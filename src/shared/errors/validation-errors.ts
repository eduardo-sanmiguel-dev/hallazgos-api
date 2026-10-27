import {
  BadRequestException,
  ValidationPipe,
  type ValidationPipeOptions,
} from '@nestjs/common';
import { getMetadataStorage, type ValidationError } from 'class-validator';

import { apiError, ERROR_CODES } from './error-codes.js';
import { fieldLabel } from './field-labels.js';

type Rule = (constraints: any[]) => string;

const lengthRule: Rule = ([min, max]) => {
  if (min && max) return `Debe tener entre ${min} y ${max} caracteres.`;
  if (max) return `Debe tener máximo ${max} caracteres.`;
  return `Debe tener al menos ${min} caracteres.`;
};

/**
 * Un mensaje por tipo de restricción, sin la etiqueta: se muestra junto al
 * campo. Las claves son los nombres de class-validator (`constraints`).
 */
const RULES: Record<string, Rule> = {
  whitelistValidation: () => 'Este dato no se acepta.',
  isDefined: () => 'Dato obligatorio.',
  isNotEmpty: () => 'Dato obligatorio.',
  arrayNotEmpty: () => 'Elige al menos 1.',
  isString: () => 'Debe ser texto.',
  isInt: () => 'Debe ser un número entero.',
  isNumber: ([options]) =>
    options?.maxDecimalPlaces !== undefined
      ? `Debe ser un número con máximo ${options.maxDecimalPlaces} decimales.`
      : 'Debe ser un número.',
  isNumberString: () => 'Debe ser un número.',
  isBoolean: () => 'Debe ser sí o no.',
  isBooleanString: () => 'Debe ser sí o no.',
  isArray: () => 'Debe ser una lista.',
  isEnum: () => 'Elige una opción válida.',
  isIn: () => 'Elige una opción válida.',
  isEmail: () => 'Correo no válido.',
  isIso8601: () => 'Fecha no válida.',
  isDate: () => 'Fecha no válida.',
  isDateString: () => 'Fecha no válida.',
  isUrl: () => 'Dirección web no válida.',
  isLatitude: () => 'Latitud no válida.',
  isLongitude: () => 'Longitud no válida.',
  nestedValidation: () => 'Datos incompletos o no válidos.',
  isPositive: () => 'Debe ser un número mayor que 0.',
  min: ([min]) => `Debe ser ${min} o mayor.`,
  max: ([max]) => `Debe ser ${max} o menor.`,
  isLength: lengthRule,
  minLength: ([min]) => `Debe tener al menos ${min} caracteres.`,
  maxLength: ([max]) => `Debe tener máximo ${max} caracteres.`,
  arrayMinSize: ([min]) => `Elige al menos ${min}.`,
  arrayMaxSize: ([max]) => `Elige máximo ${max}.`,
  matches: () => 'Formato no válido.',
};

/** Orden de RULES = prioridad: con varias fallas en un campo, gana la primera. */
const PRIORITY = Object.keys(RULES);

const DEFAULT_RULE = 'Dato no válido.';

/** Metadatos del decorador que falló: valores (min, max…) y mensaje propio. */
const findMetadata = (
  target: object | undefined,
  property: string,
  constraint: string,
) => {
  if (!target || typeof target !== 'object') return undefined;

  return getMetadataStorage()
    .getTargetValidationMetadatas(target.constructor, '', true, false)
    .find((meta) => meta.propertyName === property && meta.name === constraint);
};

const pickConstraint = (constraints: Record<string, string>) => {
  const keys = Object.keys(constraints);
  return (
    PRIORITY.find((key) => keys.includes(key)) ??
    // Una restricción sin regla (decorador propio): la primera.
    keys[0]
  );
};

/** Mensaje junto al campo para un error con `constraints`. */
const fieldMessage = (error: ValidationError) => {
  const constraints = error.constraints ?? {};
  const constraint = pickConstraint(constraints);
  const meta = findMetadata(error.target, error.property, constraint);

  // Mensajes propios del DTO ({ message: '…' }): se respetan tal cual.
  if (meta?.message) return constraints[constraint];

  const rule = RULES[constraint];
  return rule ? rule(meta?.constraints ?? []) : DEFAULT_RULE;
};

export interface FieldError {
  /** Ruta con puntos e índices: "evaluations.0.status". */
  path: string;
  /** Etiqueta del resumen: "Estatus (renglón 1)". */
  label: string;
  message: string;
}

/** Errores de class-validator (anidados) → un error por campo. */
export const flattenValidationErrors = (
  errors: ValidationError[],
  parentPath: string[] = [],
  rowIndexes: number[] = [],
): FieldError[] =>
  errors.flatMap((error) => {
    const path = [...parentPath, error.property];
    const index = Number(error.property);
    const isRow = Number.isInteger(index) && /^\d+$/.test(error.property);
    const rows = isRow ? [...rowIndexes, index] : rowIndexes;

    const own: FieldError[] =
      error.constraints && Object.keys(error.constraints).length
        ? [
            {
              path: path.join('.'),
              label: labelFor(path, rows),
              message: fieldMessage(error),
            },
          ]
        : [];

    return [
      ...own,
      ...flattenValidationErrors(error.children ?? [], path, rows),
    ];
  });

/** Etiqueta del último campo con nombre y, si está en una lista, el renglón. */
const labelFor = (path: string[], rows: number[]) => {
  const property =
    [...path].reverse().find((segment) => !/^\d+$/.test(segment)) ?? path[0];
  const label = fieldLabel(property);
  const row = rows.at(-1);

  // "Evaluaciones (renglón 2)" para el renglón completo; "Estatus (renglón 2)"
  // para un campo dentro de él. El usuario cuenta desde 1.
  return row !== undefined ? `${label} (renglón ${row + 1})` : label;
};

const lowerFirst = (text: string) =>
  text.charAt(0).toLowerCase() + text.slice(1);

const joinLabels = (labels: string[]) =>
  labels.length === 1
    ? labels[0]
    : `${labels.slice(0, -1).join(', ')} y ${labels.at(-1)}`;

/** Resumen para el aviso: con un campo, el detalle; con varios, cuáles. */
export const validationSummary = (fields: FieldError[]) => {
  if (fields.length === 0) return 'Revisa los datos enviados.';
  if (fields.length === 1) {
    const [{ label, message }] = fields;
    return `${label}: ${lowerFirst(message)}`;
  }
  return `Revisa ${fields.length} campos: ${joinLabels(fields.map((field) => field.label))}.`;
};

/** Excepción con el formato único: resumen, código y errores por campo. */
export const validationException = (errors: ValidationError[]) => {
  const fields = flattenValidationErrors(errors);

  return new BadRequestException({
    ...apiError(validationSummary(fields), ERROR_CODES.validationFailed),
    errors: Object.fromEntries(
      fields.map((field) => [field.path, field.message]),
    ),
  });
};

/** Opciones de siempre (main.ts) más el traductor de errores. */
export const VALIDATION_PIPE_OPTIONS: ValidationPipeOptions = {
  whitelist: true,
  forbidNonWhitelisted: true,
  // Los controladores reciben la instancia del DTO (con sus tipos) en lugar
  // de un objeto plano; los valores ya llegaban convertidos.
  transform: true,
  transformOptions: {
    enableImplicitConversion: true,
  },
  // El traductor lee del objeto validado (target) los valores del decorador
  // y si trae mensaje propio. No viaja en la respuesta.
  validationError: { target: true, value: false },
  exceptionFactory: validationException,
};

export const createValidationPipe = () =>
  new ValidationPipe(VALIDATION_PIPE_OPTIONS);
