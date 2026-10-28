/**
 * Nombre legible de cada campo de los DTO, para el resumen de los errores de
 * validación ("Ubicación: debe tener entre 5 y 150 caracteres."). Es uno
 * solo para todos los DTO porque los nombres se repiten con el mismo
 * significado; field-labels.spec.ts falla si un campo validado no tiene
 * etiqueta.
 */
export const FIELD_LABELS: Record<string, string> = {
  // Generales
  id: 'Identificador',
  ids: 'Identificadores',
  name: 'Nombre',
  description: 'Descripción',
  comment: 'Comentario',
  comments: 'Comentarios',
  observations: 'Observaciones',
  status: 'Estatus',
  statuses: 'Estatus',
  search: 'Búsqueda',
  page: 'Página',
  limit: 'Registros por página',
  order: 'Orden',
  orderBy: 'Orden',
  view: 'Vista',
  startDate: 'Fecha de inicio',
  endDate: 'Fecha de fin',
  timeZone: 'Zona horaria',
  token: 'Enlace de recuperación',

  // Usuarios y sesión
  email: 'Correo electrónico',
  password: 'Contraseña',
  rule: 'Rol',
  userId: 'Usuario',
  userIds: 'Usuarios',
  userName: 'Usuario',

  // Plantas, zonas, procesos y áreas
  manufacturingPlantId: 'Planta',
  manufacturingPlantNames: 'Plantas',
  manufacturingPlantsIds: 'Plantas',
  zone: 'Zona',
  zoneId: 'Zona',
  zoneIds: 'Zonas',
  zoneNames: 'Zonas',
  process: 'Proceso',
  processId: 'Proceso',
  processIds: 'Procesos',
  processNames: 'Procesos',
  area: 'Área',
  areaId: 'Área',
  areaIds: 'Áreas',
  coordinateX: 'Coordenada X',
  coordinateY: 'Coordenada Y',
  zoomLevel: 'Nivel de acercamiento',
  withArea: 'Con área',
  lat: 'Latitud',
  lng: 'Longitud',
  link: 'Link',

  // Hallazgos
  type: 'Tipo',
  typeHallazgo: 'Clasificación',
  mainTypeId: 'Clasificación',
  mainTypeIds: 'Clasificaciones',
  secondaryType: 'Tipo',
  secondaryTypeIds: 'Tipos',
  typeResponsible: 'Tipo de responsable',
  requiresEvidence: 'Requiere evidencia fotográfica',
  supervisor: 'Supervisor',
  responsible: 'Responsable',
  responsibleId: 'Responsable',
  responsibleIds: 'Responsables',
  priorityDays: 'Prioridad',
  descriptionSolution: 'Descripción de la solución',

  // Colaboradores
  employee: 'Colaborador',
  employeeId: 'Colaborador',
  employeesIds: 'Colaboradores',
  imgEvidence: 'Foto de evidencia',
  code: 'Código de empleado',
  birthdate: 'Fecha de nacimiento',
  dateOfAdmission: 'Fecha de admisión',
  genderId: 'Género',
  genreId: 'Género',
  isActive: 'Activo',
  positionId: 'Puesto',

  // EPP y equipos
  equipments: 'Equipos',
  equipmentId: 'Equipo',
  quantity: 'Cantidad',
  signature: 'Firma',
  price: 'Precio',
  deliveryFrequency: 'Frecuencia de entrega',
  withHistory: 'Con historial',

  // Equipos de emergencia e inspección de extintores
  location: 'Ubicación',
  extinguisherNumber: 'Número de extintor',
  typeOfExtinguisher: 'Tipo de extintor',
  capacity: 'Capacidad',
  evaluations: 'Evaluaciones',
  maintenanceDate: 'Fecha de mantenimiento',
  nextRechargeDate: 'Próxima recarga',
  pressureManometer: 'Manómetro',
  valve: 'Válvula',
  hose: 'Manguera',
  cornet: 'Corneta',
  cylinder: 'Cilindro',
  barrette: 'Pasador',
  seal: 'Sello',
  signaling: 'Señalización',
  support: 'Soporte',
  access: 'Acceso',

  // ICS
  totalPeople: 'Personas totales',
  ruleOfLifeId: 'Regla de vida',
  standardOfBehaviorId: 'Estándar de comportamiento',
  areaOfBehaviorId: 'Área de comportamiento',

  // CIAEL
  eventDate: 'Fecha del evento',
  typeOfEventId: 'Tipo de evento',
  // Como en la pantalla.
  accidentPositionId: 'Nombre del cargo',
  areaLeaderId: 'Líder de área',
  associatedTaskId: 'Tarea asociada',
  atAgentId: 'Agente AT',
  atMechanismId: 'Mecanismo o forma del AT',
  bodyPartId: 'Parte del cuerpo afectada',
  cieDiagnosisId: 'Diagnóstico CIE',
  daysOfDisability: 'Días de incapacidad',
  isDeath: 'Muerte',
  isInside: 'Dentro de la empresa',
  machineId: 'Máquina / Equipo',
  machineName: 'Máquina / Equipo',
  managerId: 'Gestor en turno',
  natureOfEventsId: 'Naturaleza del evento',
  riskFactorId: 'Factor de riesgo asociado',
  timeWorked: 'Tiempo laborado previo al AT',
  typeOfInjuryId: 'Tipo de lesión',
  typeOfLinkId: 'Tipo de vinculación',
  usualWork: 'Labor habitual',
  workingDayId: 'Jornada',

  // Gemba Walk
  category: 'Categoría',
  nameZone: 'Zona',
  nameLocation: 'Lugar',
  gembaWalkZoneId: 'Zona',
  gembaWalkCalendarId: 'Recorrido programado',
  gembaWalkEvaluationId: 'Evaluación',
  events: 'Recorridos',
  scheduledAt: 'Fecha programada',
  isAdditional: 'Recorrido adicional',
  isCompliant: 'Cumple',
  results: 'Resultados',
  startToken: 'Inicio del recorrido',
};

/** Etiqueta del campo, o el nombre técnico entre comillas si no tiene. */
export const fieldLabel = (property: string) =>
  FIELD_LABELS[property] ?? `«${property}»`;
