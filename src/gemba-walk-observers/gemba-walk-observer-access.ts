import type { Repository } from 'typeorm';
import type { GembaWalkObserver } from './entities/gemba-walk-observer.entity.js';

/**
 * ¿Puede usar el módulo de Gemba Walk? Solo los observadores activos (en una
 * zona y planta activas); el administrador entra aunque no esté registrado.
 * La usan GET /gemba-walk/walks/access, cada endpoint del módulo y el
 * usuario en sesión (`isGembaWalkObserver`), para que la regla sea una.
 */
export const isGembaWalkObserver = async (
  repository: Repository<GembaWalkObserver>,
  { userId, isAdmin }: { userId: number; isAdmin: boolean },
): Promise<boolean> => {
  if (isAdmin) return true;

  const count = await repository.count({
    where: {
      isActive: true,
      user: { id: userId },
      gembaWalkZone: { isActive: true },
      manufacturingPlant: { isActive: true },
    },
  });

  return count > 0;
};
