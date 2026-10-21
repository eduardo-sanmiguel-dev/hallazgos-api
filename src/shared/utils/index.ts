import * as fs from 'fs';
import * as path from 'path';
import { safeFilePath } from './safe-file-path.js';

export const expireTime = 60 * 60 * 24 * 30; // 30 days in seconds

export const expiresIn = () => {
  return Math.floor(Date.now() / 1000) + expireTime;
};

export { stringToDateWithTime, durantionToTime } from './date-time.js';

export const groupBy = (
  items: {
    [key: string]: any;
  }[],
  key: string,
) =>
  items.reduce(
    (result, item) => ({
      ...result,
      [item[key]]: [...(result[item[key]] || []), item],
    }),
    {},
  );

export const formatDateToYYYYMMDD = (dateString: string) => {
  const date = dateString.split('T')[0].split('-');
  return `${date[0]}-${date[1]}-${date[2]}`;
};

export const formatDateToDDMMYYYY = (dateString: string) => {
  const date = dateString.split('T')[0].split('-');
  return `${date[2]}/${date[1]}/${date[0]}`;
};

export function uploadStaticImage(img: string): string {
  if (!img) {
    return null;
  }

  const routeImg = safeFilePath(
    path.join(process.cwd(), 'public', 'static', 'images'),
    img,
  );

  if (!routeImg) {
    return null;
  }

  const buffer = fs.readFileSync(routeImg);
  return buffer.toString('base64');
}

export function calculateAge(birthDate: string | Date): number {
  const today = new Date();
  const birth = new Date(birthDate);

  let age = today.getFullYear() - birth.getFullYear();
  const month = today.getMonth() - birth.getMonth();

  if (month < 0 || (month === 0 && today.getDate() < birth.getDate())) {
    age--;
  }

  return age;
}

export * from './query-string-array-transformer.util.js';
export * from './timezone.js';
export * from './file-name.js';
export * from './storage-timezones.js';
export * from './paginate.js';
export * from './temp-dir.js';
export * from './image-upload.js';
export * from './plant-scope.js';

export const getColombiaNow = (
  colombianIds: number[],
  manufacturingPlantId: number,
) => {
  const now = new Date();

  const dateColombian = new Date(
    now.toLocaleString('en-US', { timeZone: 'America/Bogota' }),
  );

  return colombianIds.includes(manufacturingPlantId)
    ? dateColombian
    : new Date();
};
