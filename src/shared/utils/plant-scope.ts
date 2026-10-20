/**
 * Plantas que un usuario puede consultar: las suyas, o solo la pedida si es
 * suya. Devuelve vacío si no tiene plantas o pide una planta ajena.
 */
export const scopePlantIds = (
  userPlants: { id: number | string }[] | undefined,
  requestedPlantId?: number | string,
): number[] => {
  const ownPlantIds = (userPlants ?? []).map(({ id }) => Number(id));

  if (!requestedPlantId) return ownPlantIds;

  return ownPlantIds.filter((id) => id === Number(requestedPlantId));
};
