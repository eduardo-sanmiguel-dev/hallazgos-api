import { BadRequestException } from '@nestjs/common';

/** Rango de fechas inclusivo como 'YYYY-MM-DD'. */
export interface DateRange {
  desde: string;
  hasta: string;
}

export interface BiEppPeriod {
  actual: DateRange;
  anterior: DateRange;
}

// Más de esto vuelve lentas las consultas y no aporta a un tablero.
const MAX_RANGE_DAYS = 3 * 366;

const DAY_MS = 86_400_000;

const toIso = (date: Date) => date.toISOString().slice(0, 10);
const fromIso = (iso: string) => new Date(`${iso}T00:00:00Z`);
const addDays = (iso: string, days: number) =>
  toIso(new Date(fromIso(iso).getTime() + days * DAY_MS));
const daysInMonth = (year: number, month: number) =>
  new Date(Date.UTC(year, month + 1, 0)).getUTCDate();

/** Mismo día `months` meses antes, recortado al último día de ese mes. */
const shiftMonths = (iso: string, months: number, toMonthEnd = false) => {
  const date = fromIso(iso);
  const target = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth() - months, 1),
  );
  const lastDay = daysInMonth(target.getUTCFullYear(), target.getUTCMonth());
  target.setUTCDate(
    toMonthEnd ? lastDay : Math.min(date.getUTCDate(), lastDay),
  );
  return toIso(target);
};

const isMonthEnd = (iso: string) => {
  const date = fromIso(iso);
  return (
    date.getUTCDate() === daysInMonth(date.getUTCFullYear(), date.getUTCMonth())
  );
};

/** 'DD/MM/YYYY' (formato de los filtros del dashboard) → 'YYYY-MM-DD'. */
const parseDdMmYyyy = (value: string, label: string) => {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value);
  const iso = match ? `${match[3]}-${match[2]}-${match[1]}` : '';
  if (
    !match ||
    Number.isNaN(fromIso(iso).getTime()) ||
    toIso(fromIso(iso)) !== iso
  ) {
    throw new BadRequestException(`${label} debe tener el formato DD/MM/YYYY`);
  }
  return iso;
};

/**
 * Periodo del análisis EPP y su periodo de comparación.
 * - Sin fechas: el mes en curso hasta hoy.
 * - Comparación:
 *   - Desde el 1 de enero: mismas fechas del año anterior ("este año").
 *   - Desde un día 1: los mismos días, tantos meses atrás como abarca el
 *     rango ("este mes" → mismos días del mes anterior; "mes anterior"
 *     completo → el mes previo completo).
 *   - Cualquier otro rango: el periodo inmediato anterior de igual duración.
 */
export const resolveBiEppPeriod = (
  startDate: string | undefined,
  endDate: string | undefined,
  today: string,
): BiEppPeriod => {
  if (!startDate !== !endDate) {
    throw new BadRequestException('Envía la fecha inicial y la final juntas');
  }

  const desde = startDate
    ? parseDdMmYyyy(startDate, 'startDate')
    : `${today.slice(0, 7)}-01`;
  const hasta = endDate ? parseDdMmYyyy(endDate, 'endDate') : today;

  if (desde > hasta) {
    throw new BadRequestException(
      'La fecha inicial no puede ser posterior a la final',
    );
  }
  const days =
    (fromIso(hasta).getTime() - fromIso(desde).getTime()) / DAY_MS + 1;
  if (days > MAX_RANGE_DAYS) {
    throw new BadRequestException('El rango no puede ser mayor a 3 años');
  }

  let anterior: DateRange;
  if (desde.slice(5) === '01-01') {
    anterior = {
      desde: shiftMonths(desde, 12),
      hasta: shiftMonths(hasta, 12, isMonthEnd(hasta)),
    };
  } else if (desde.endsWith('-01')) {
    const [y1, m1] = desde.split('-').map(Number);
    const [y2, m2] = hasta.split('-').map(Number);
    const months = (y2 - y1) * 12 + (m2 - m1) + 1;
    anterior = {
      desde: shiftMonths(desde, months),
      hasta: shiftMonths(hasta, months, isMonthEnd(hasta)),
    };
  } else {
    const fin = addDays(desde, -1);
    anterior = { desde: addDays(fin, -(days - 1)), hasta: fin };
  }

  return { actual: { desde, hasta }, anterior };
};
