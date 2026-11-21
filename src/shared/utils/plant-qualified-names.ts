import type { FindOptionsWhere, Repository } from 'typeorm';

interface PlantCatalogItem {
  name: string;
  isActive: boolean;
  manufacturingPlant: { name: string; isActive: boolean };
}

/**
 * Registros activos de catálogos por planta (zonas, procesos) a partir de
 * "Planta - Nombre", como los manda la UI. El nombre puede tener " - ".
 *
 * Una sola consulta para todos: antes era un findOne por nombre (dos
 * consultas cada uno por el join con la planta), hasta 261 en un PATCH de
 * usuario con muchas zonas.
 *
 * Devuelve en el orden recibido y omite los que no existen o están
 * inactivos (igual que antes). Sin la relación `manufacturingPlant`, que solo
 * sirve para emparejar.
 */
export const findActiveByPlantQualifiedNames = async <
  T extends PlantCatalogItem,
>(
  repository: Repository<T>,
  names: string[] | undefined,
): Promise<T[]> => {
  if (!names?.length) return [];

  const wanted = names.map((qualified) => {
    const [plant, ...rest] = qualified.split(' - ');
    return { plant, name: rest.join(' - ') };
  });
  const key = (plant: string, name: string) => `${plant}\u0000${name}`;

  const found = await repository.find({
    where: wanted.map(
      ({ plant, name }) =>
        ({
          name,
          isActive: true,
          manufacturingPlant: { name: plant, isActive: true },
        }) as FindOptionsWhere<T>,
    ),
    relations: { manufacturingPlant: true } as never,
  });

  const byKey = new Map<string, T>(
    found.map(({ manufacturingPlant, ...item }) => [
      key(manufacturingPlant.name, item.name),
      item as T,
    ]),
  );
  return wanted
    .map(({ plant, name }) => byKey.get(key(plant, name)))
    .filter(Boolean);
};
