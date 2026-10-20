/** Lee fechas ISO sin desplazar al día anterior las que no incluyen hora. */
const parseDate = (value: string | Date): Date => {
  if (value instanceof Date) return value;
  if (value === undefined) return new Date();
  if (value === null || value === '') return new Date(NaN);

  const calendar = /^(\d{4})(?:-(\d{2})(?:-(\d{2}))?)?(?=$|[T ])/.exec(value);
  if (calendar) {
    const year = Number(calendar[1]);
    const month = Number(calendar[2] ?? 1);
    const day = Number(calendar[3] ?? 1);
    const lastDay = new Date(0);
    lastDay.setUTCFullYear(year, month, 0);
    if (month < 1 || month > 12 || day < 1 || day > lastDay.getUTCDate()) {
      return new Date(NaN);
    }

    // YYYY, YYYY-MM y YYYY-MM-DD representan medianoche local.
    if (calendar[0] === value) {
      const date = new Date(0);
      date.setFullYear(year, month - 1, day);
      date.setHours(0, 0, 0, 0);
      return date;
    }
  }

  return new Date(value);
};

/** Formato español de correos y PDF, en la zona horaria del proceso. */
export const stringToDateWithTime = (value: string | Date): string => {
  const date = parseDate(value);
  if (Number.isNaN(date.getTime())) return 'Fecha inválida';

  const month = new Intl.DateTimeFormat('es', { month: 'long' }).format(date);
  const year = String(date.getFullYear()).padStart(4, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${date.getDate()} de ${month} de ${year} ${date.getHours()}:${minutes}`;
};

/** Componentes de la duración: las horas no incluyen los días completos. */
export const durantionToTime = (startDate: Date, endDate: Date): string => {
  const milliseconds =
    parseDate(endDate).getTime() - parseDate(startDate).getTime();
  const hours = Math.trunc(milliseconds / 3_600_000) % 24;
  const minutes = Math.trunc(milliseconds / 60_000) % 60;
  const seconds = Math.trunc(milliseconds / 1_000) % 60;
  return `${hours ? hours + 'h' : ''} ${minutes ? minutes + 'm' : ''} ${
    seconds ? seconds + 's' : ''
  }`;
};
