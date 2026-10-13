// Categorías de los conceptos de evaluación del Gemba Walk.
// Para agregar una nueva basta con sumarla aquí (y en la UI).
export const GEMBA_WALK_EVALUATION_CATEGORIES = ['SHE', 'CALIDAD'] as const;

export type GembaWalkEvaluationCategory =
  (typeof GEMBA_WALK_EVALUATION_CATEGORIES)[number];
