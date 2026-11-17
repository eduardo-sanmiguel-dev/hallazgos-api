/** Columnas por las que el listado de equipos se puede ordenar (lista blanca). */
export const EQUIPMENT_SORT_COLUMNS = {
  id: 'id',
  name: 'name',
  deliveryFrequency: 'deliveryFrequency',
  manufacturingPlant: 'manufacturingPlant.name',
  createdAt: 'createdAt',
  createdBy: 'createdBy.name',
  updatedAt: 'updatedAt',
  updatedBy: 'updatedBy.name',
  isActive: 'isActive',
} as const;
export type EquipmentSortColumn = keyof typeof EQUIPMENT_SORT_COLUMNS;
export const EQUIPMENT_DEFAULT_SORT = {
  orderBy: 'name',
  order: 'asc',
} as const;
