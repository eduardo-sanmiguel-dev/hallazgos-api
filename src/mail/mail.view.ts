import { join } from 'path';

import { Evidence } from '../evidences/entities/evidence.entity.js';
import { stringToDateWithTime } from '../shared/utils/index.js';
import { priorityLevelByDays } from '../shared/constants/priority.js';
import {
  STATUS_CANCEL,
  STATUS_CLOSE,
  STATUS_IN_PROGRESS,
  STATUS_OPEN,
} from '../shared/constants/index.js';

// Datos de presentación de los correos: tema de cada aviso, pasos del
// seguimiento, plazo y la cuadrícula de detalles. Las plantillas (Handlebars,
// sin lógica) solo los pintan.

// Logos optimizados para correo (recortados, 2x). Van como adjuntos en línea
// (CID): se ven aunque el cliente bloquee las imágenes remotas.
export const MAIL_IMAGES_DIR = join(
  import.meta.dirname,
  '..',
  '..',
  'public',
  'static',
  'images',
  'mail',
);

export const LOGO_ATTACHMENTS = [
  {
    filename: 'hada.png',
    path: join(MAIL_IMAGES_DIR, 'hada.png'),
    cid: 'logoHada',
  },
  {
    filename: 'comportarte.png',
    path: join(MAIL_IMAGES_DIR, 'comportarte.png'),
    cid: 'logoComportarte',
  },
];

export const BRAND_GREEN = '#77b72a';
const PENDING = '#dfe6dd';
const INK = '#13221a';
const DANGER = '#d32f2f';
const NEUTRAL_DOT = '#94a199';

export interface MailTheme {
  eyebrow: string;
  accent: string;
  kicker: string;
}

// Color de acento por aviso (franja, etiqueta, paso actual y citas): los
// mismos colores de estatus que la UI (semanticTones + tema claro): ámbar
// abierto, azul en progreso, verde cerrado, rojo cancelado.
export const STATUS_ACCENTS: Record<string, string> = {
  [STATUS_OPEN]: '#b45309',
  [STATUS_IN_PROGRESS]: '#0277bd',
  [STATUS_CLOSE]: '#2e7d32',
  [STATUS_CANCEL]: '#d32f2f',
};

export const MAIL_THEMES = {
  create: { eyebrow: 'Nuevo hallazgo', accent: STATUS_ACCENTS[STATUS_OPEN] },
  inProgress: {
    eyebrow: 'En proceso',
    accent: STATUS_ACCENTS[STATUS_IN_PROGRESS],
  },
  solution: { eyebrow: 'Solucionado', accent: STATUS_ACCENTS[STATUS_CLOSE] },
  // Reasignar no cambia el estatus: toma el color del estatus actual.
  reassign: { eyebrow: 'Reasignado', accent: STATUS_ACCENTS[STATUS_OPEN] },
  cancel: { eyebrow: 'Cancelado', accent: STATUS_ACCENTS[STATUS_CANCEL] },
  account: { eyebrow: 'Seguridad de tu cuenta', accent: '#3e6925' },
} as const;

export type MailThemeName = keyof typeof MAIL_THEMES;

export const mailTheme = (
  name: MailThemeName,
  kicker: string,
  // Color del estatus actual del hallazgo (reasignado).
  status?: string,
): MailTheme => ({
  ...MAIL_THEMES[name],
  ...(status && STATUS_ACCENTS[status] && { accent: STATUS_ACCENTS[status] }),
  kicker,
});

const formatDate = (value?: Date | string | null) =>
  value ? stringToDateWithTime(value) : '';

const plural = (days: number) =>
  `${days} ${Math.abs(days) === 1 ? 'día' : 'días'}`;

/** Indicador de las plantillas (partial `tile`). */
export interface TileView {
  value: string;
  hint: string;
  dot: string;
  valueColor: string;
}

const tile = (
  value: string,
  hint: string,
  dot = NEUTRAL_DOT,
  valueColor = INK,
): TileView => ({ value, hint, dot, valueColor });

/** Fecha en un indicador: "20 oct 2026" con la hora como nota. */
export const dateTile = (value?: Date | string | null, hint?: string) => {
  const full = formatDate(value);
  // "20 de octubre de 2026 8:05" → día corto y hora.
  const match = /^(\d+) de (\p{L}+) de (\d+) (\d+:\d+)$/u.exec(full);
  if (!match) return tile(full || '—', hint ?? '');
  const [, day, month, year, time] = match;
  return tile(`${day} ${month.slice(0, 3)} ${year}`, hint ?? time);
};

/**
 * Plazo para atender el hallazgo a partir de los días restantes ("5", "-2",
 * "" sin prioridad).
 */
export const deadlineTile = (remainingDays: string) => {
  if (remainingDays === '') return tile('Sin plazo', 'Sin prioridad asignada');
  const days = Number(remainingDays);
  if (days < 0) return tile('Vencido', `Hace ${plural(-days)}`, DANGER, DANGER);
  if (days === 0) return tile('Hoy', 'Vence hoy', DANGER, DANGER);
  return tile(plural(days), 'Para atenderlo', BRAND_GREEN);
};

/** Prioridad con el color del dashboard (punto junto al nombre). */
export const priorityTile = (priorityDays?: number | null) => {
  const level = priorityLevelByDays(priorityDays);
  if (level) return tile(level.name, plural(level.days), level.color);
  if (priorityDays) return tile(plural(priorityDays), 'Plazo de atención');
  return tile('Sin prioridad', 'No asignada');
};

/** Cuánto tardó la solución y si fue dentro del plazo. */
export const resolutionTile = (
  resolution: {
    daysLabel: string;
    statusLabel: string;
    isOnTime: boolean;
  } | null,
) => {
  if (!resolution) return tile('—', 'Sin fecha de solución');
  if (!resolution.statusLabel) {
    return tile(resolution.daysLabel, 'Sin plazo definido', BRAND_GREEN);
  }
  return resolution.isOnTime
    ? tile(resolution.daysLabel, resolution.statusLabel, BRAND_GREEN)
    : tile(resolution.daysLabel, resolution.statusLabel, DANGER, DANGER);
};

/** Indicador de texto libre (una persona, por ejemplo). */
export const textTile = (value: string, hint = '') => tile(value || '—', hint);

/** Fila de indicadores con su etiqueta; todos del mismo ancho. */
export const tileRow = (tiles: [label: string, tile: TileView][]) =>
  tiles.map(([label, view]) => ({
    label,
    ...view,
    width: `${Math.floor(100 / tiles.length)}%`,
  }));

interface PhotoRef {
  cid: string;
  caption: string;
  color: string;
}

/**
 * Fotos del aviso: dos lado a lado (antes / después) o una sola. Solo las
 * que existen: la plantilla nunca apunta a un adjunto que no se envió.
 */
export const photosView = (heading: string, photos: (PhotoRef | null)[]) => {
  const [first, second] = photos.filter((photo): photo is PhotoRef => !!photo);
  if (first && second) {
    return {
      photo: null,
      photoPair: {
        heading,
        leftCid: first.cid,
        leftCaption: first.caption,
        leftColor: first.color,
        rightCid: second.cid,
        rightCaption: second.caption,
        rightColor: second.color,
      },
    };
  }
  if (first) {
    return {
      photoPair: null,
      photo: {
        heading,
        cid: first.cid,
        alt: first.caption,
        caption: first.caption,
      },
    };
  }
  return { photo: null, photoPair: null };
};

export interface StepView {
  label: string;
  date: string;
  person: string;
  color: string;
  labelColor: string;
}

/**
 * Seguimiento del hallazgo: Registrado → En proceso → Solucionado. El último
 * paso alcanzado va con el acento del aviso; los anteriores, en verde de
 * marca; los pendientes, en gris. Cancelado reemplaza a los que faltaban.
 */
export const evidenceSteps = (
  evidence: Evidence,
  accent: string,
  cancelled?: { at: string; by: string },
): StepView[] => {
  const raw = [
    {
      label: 'Registrado',
      date: formatDate(evidence.createdAt),
      person: evidence.user?.name || '',
      reached: true,
    },
    {
      label: 'En proceso',
      date: formatDate(evidence.startProcessDate),
      person: evidence.startedBy?.name || '',
      reached: !!evidence.startProcessDate,
    },
    {
      label: 'Solucionado',
      date: formatDate(evidence.solutionDate),
      person: evidence.closedBy?.name || '',
      reached: !!evidence.solutionDate,
    },
  ];

  const steps = cancelled
    ? [
        ...raw.filter(({ reached }) => reached),
        {
          label: 'Cancelado',
          date: cancelled.at,
          person: cancelled.by,
          reached: true,
        },
      ]
    : raw;

  const current = steps.map(({ reached }) => reached).lastIndexOf(true);

  return steps.map(({ label, date, person, reached }, index) => {
    const isCurrent = index === current;
    // Un paso saltado (p. ej. solucionado sin pasar por "en proceso").
    const skipped = !reached && index < current;
    return {
      label,
      date: reached ? date : skipped ? 'Sin registro' : 'Pendiente',
      person: reached ? person : '',
      color: isCurrent ? accent : reached ? BRAND_GREEN : PENDING,
      labelColor: reached ? '#13221a' : '#8a978f',
    };
  });
};

export interface DetailCell {
  label: string;
  value: string;
}

/** Celdas en filas de dos (la plantilla no puede agruparlas). */
export const detailRows = (cells: DetailCell[]) => {
  const visible = cells.filter(({ value }) => !!value);
  const rows: { left: DetailCell; right: DetailCell | null }[] = [];
  for (let i = 0; i < visible.length; i += 2) {
    rows.push({ left: visible[i], right: visible[i + 1] ?? null });
  }
  return rows;
};

const names = (users?: { name: string }[] | null) =>
  (users ?? []).map(({ name }) => name).join(', ');

/** Detalles comunes del hallazgo, con los nombres que usa la UI. */
export const evidenceDetails = (evidence: Evidence) =>
  detailRows([
    { label: 'Planta', value: evidence.manufacturingPlant?.name || '' },
    { label: 'Zona', value: evidence.zone?.area?.name || '' },
    { label: 'Lugar', value: evidence.zone?.name || '' },
    { label: 'Proceso', value: evidence.process?.name || '' },
    { label: 'Criterio', value: evidence.mainType?.name || '' },
    { label: 'Tipo', value: evidence.secondaryType?.name || '' },
    { label: 'Reportado por', value: evidence.user?.name || '' },
    { label: 'Supervisores', value: names(evidence.supervisors) },
    { label: 'Responsables', value: names(evidence.responsibles) },
  ]);

/** Texto de vista previa en la bandeja (se recorta a ~110 caracteres). */
export const preheader = (text: string) => {
  const clean = text.replace(/\s+/g, ' ').trim();
  return clean.length > 110 ? `${clean.slice(0, 107).trimEnd()}…` : clean;
};
