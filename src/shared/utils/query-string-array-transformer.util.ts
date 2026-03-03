import { TransformFnParams } from 'class-transformer';

export const parseStringArrayQueryByKey =
  (key: string) =>
  ({ value, obj }: TransformFnParams): string[] | undefined => {
    const source = (obj ?? {}) as Record<string, unknown>;
    const rawValue = value ?? source[`${key}[]`];

    if (rawValue === undefined || rawValue === null || rawValue === '') {
      return undefined;
    }

    const values = Array.isArray(rawValue)
      ? rawValue
      : String(rawValue).split(',');

    const normalizedValues = values
      .map((item) => String(item).trim())
      .filter((item) => item.length > 0);

    return normalizedValues.length ? normalizedValues : undefined;
  };
