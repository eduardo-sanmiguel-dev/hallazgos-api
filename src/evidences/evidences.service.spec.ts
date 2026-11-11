import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { Writable } from 'node:stream';
import { FindOperator } from 'typeorm';
import XlsxPopulate from 'xlsx-populate';

import {
  ENV_DEVELOPMENT,
  ENV_PRODUCTION,
  ROLE_ADMINISTRADOR,
  ROLE_SUPERVISOR,
  STATUS_CANCEL,
  STATUS_CLOSE,
  STATUS_IN_PROGRESS,
  STATUS_OPEN,
} from '../shared/constants/index.js';
import {
  buildAdmin,
  buildEvidence,
  buildManufacturingPlant,
  buildSupervisor,
  buildUser,
  createServiceTestingModule,
  mockProvider,
  type RepositoryMock,
  runAsUser,
} from '../../test/utils/index.js';
import { MailService } from '../mail/mail.service.js';
import { MainTypesService } from '../main-types/main-types.service.js';
import { ManufacturingPlantsService } from '../manufacturing-plants/manufacturing-plants.service.js';
import { ProcessesService } from '../processes/processes.service.js';
import { SecondaryTypesService } from '../secondary-types/secondary-types.service.js';
import { User } from '../users/entities/user.entity.js';
import { UsersService } from '../users/users.service.js';
import { ZonesService } from '../zones/zones.service.js';
import { Comment } from './entities/comments.entity.js';
import { Evidence } from './entities/evidence.entity.js';
import { EvidencesService } from './evidences.service.js';

/** Deja terminar las promesas que el servicio lanza sin esperar. */
const flushBackgroundWork = async () => {
  for (let i = 0; i < 10; i++) await new Promise(setImmediate);
};

/**
 * Registra las promesas de correo que el servicio lanza sin esperar. Si una
 * terminara rechazada sin que nadie la maneje, en producción Node terminaría
 * el proceso. Se les agrega un manejador al registrarlas.
 */
const trackBackgroundEmails = (service: EvidencesService) => {
  const promises: Promise<unknown>[] = [];
  for (const method of ['sendEmailUsers', 'notifyByEmail'] as const) {
    const original = service[method].bind(service);
    jest.spyOn(service, method).mockImplementation(((...args: unknown[]) => {
      const promise = original(...args);
      promises.push(promise);
      return promise;
    }) as never);
  }
  return {
    rejections: async () =>
      (await Promise.allSettled(promises))
        .filter((r): r is PromiseRejectedResult => r.status === 'rejected')
        .map((r) => (r.reason as Error).message),
  };
};

const operand = (value: unknown) => (value as FindOperator<unknown>).value;

describe('EvidencesService', () => {
  let service: EvidencesService;
  let evidences: RepositoryMock<Evidence>;
  let comments: RepositoryMock<Comment>;
  let plants: jest.Mocked<ManufacturingPlantsService>;
  let usersService: jest.Mocked<UsersService>;
  let mail: jest.Mocked<MailService>;
  let zones: jest.Mocked<ZonesService>;
  let mainTypesService: jest.Mocked<MainTypesService>;
  let logError: jest.SpyInstance;
  let logWarn: jest.SpyInstance;
  // "Tabla" de hallazgos: findOne aplica el filtro de plantas como la base.
  let stored: Evidence[];

  const plant = buildManufacturingPlant({ id: 1, name: 'Tepotzotlán' });
  const otherPlant = buildManufacturingPlant({ id: 2, name: 'Manizales' });
  const inPlant = { manufacturingPlants: [plant] };
  const reporter = buildUser({ id: 100, name: 'Quien reporta', ...inPlant });
  const supervisor = buildSupervisor({
    id: 200,
    name: 'Supervisor',
    ...inPlant,
  });
  const responsible = buildUser({ id: 300, name: 'Responsable', ...inPlant });
  const plantUser = buildUser({ id: 400, name: 'Usuario de la planta' });
  const devUser = buildUser({ id: 1, name: 'Cuenta de desarrollo' });
  const outsider = buildUser({ id: 500, manufacturingPlants: [otherPlant] });

  const setup = async (environment = ENV_PRODUCTION) => {
    const testing = await createServiceTestingModule(EvidencesService, {
      repositories: [Evidence, Comment],
      providers: [
        {
          provide: ConfigService,
          useValue: { get: (key: string) => ({ environment })[key] },
        },
        mockProvider(ManufacturingPlantsService),
        mockProvider(MainTypesService),
        mockProvider(SecondaryTypesService),
        mockProvider(ZonesService),
        mockProvider(ProcessesService),
        mockProvider(UsersService),
        mockProvider(MailService),
      ],
    });
    service = testing.service;
    evidences = testing.repository(Evidence);
    comments = testing.repository(Comment);
    plants = testing.get(ManufacturingPlantsService);
    usersService = testing.get(UsersService);
    mail = testing.get(MailService);
    mail.withOutbox.mockImplementation(async (_manager, work) => work());
    zones = testing.get(ZonesService);
    mainTypesService = testing.get(MainTypesService);

    plants.findOne.mockResolvedValue(plant);
    plants.getColombianPlantsIds.mockResolvedValue([2]);
    mainTypesService.findOne.mockResolvedValue({
      id: 1,
      name: 'Condición insegura',
      requiresEvidence: true,
    } as never);
    testing
      .get(SecondaryTypesService)
      .findOne.mockResolvedValue({ id: 2 } as never);
    zones.findOne.mockResolvedValue({ id: 3, name: 'Almacén' } as never);
    testing.get(ProcessesService).findOne.mockResolvedValue({ id: 4 } as never);
    usersService.findOne.mockImplementation(async (id) =>
      id === 1 ? devUser : reporter,
    );
    usersService.findSupervisor.mockResolvedValue([supervisor]);
    usersService.findProcesses.mockResolvedValue([responsible]);
    usersService.findAllByPlant.mockResolvedValue([plantUser]);
    evidences.save.mockImplementation(async (e) => {
      const current = stored.find((row) => row.id === e.id);
      return (
        current ? Object.assign(current, e) : Object.assign(e, { id: 900 })
      ) as Evidence;
    });
    Object.assign(evidences, {
      manager: {
        transaction: jest.fn(async (callback) =>
          callback({ getRepository: () => evidences }),
        ),
      },
    });
    stored = [];
    evidences.findOne.mockImplementation(async ({ where }) => {
      const { id, manufacturingPlant } = where as {
        id: number;
        manufacturingPlant?: { id: unknown };
      };
      const allowed = manufacturingPlant
        ? (operand(manufacturingPlant.id) as number[])
        : null;
      return (
        stored.find(
          (e) =>
            e.id === id &&
            (!allowed || allowed.includes(Number(e.manufacturingPlant.id))),
        ) ?? null
      );
    });
    for (const method of [
      'sendCreate',
      'sendInProgress',
      'sendSolution',
      'sendCancel',
      'sendReassign',
    ] as const) {
      mail[method].mockResolvedValue(undefined);
    }
  };

  /**
   * El cambio de estado se guarda con un UPDATE condicionado al estado actual:
   * `WHERE id = :id AND status IN (:allowed)`.
   */
  const expectGuardedUpdate = (
    id: number,
    allowed: string[],
    changes: Partial<Evidence>,
  ) => {
    expect(evidences.update).toHaveBeenCalledTimes(1);
    const [where, values] = evidences.update.mock.calls[0] as [
      { id: number; status: unknown },
      Partial<Evidence>,
    ];
    expect(where.id).toBe(id);
    expect(operand(where.status)).toEqual(allowed);
    expect(values).toMatchObject(changes);
  };

  beforeEach(async () => {
    logError = jest.spyOn(Logger.prototype, 'error').mockImplementation();
    logWarn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    await setup();
  });

  afterEach(() => {
    logError.mockRestore();
    logWarn.mockRestore();
  });

  describe('create', () => {
    const dto = {
      manufacturingPlantId: 1,
      typeHallazgo: 1,
      type: 2,
      zone: 3,
      process: 4,
      supervisor: 0,
      description: 'Derrame en pasillo',
      priorityDays: 7,
    };
    const file = { filename: 'uuid-evidence.png' } as Express.Multer.File;
    const create = (
      overrides = {},
      upload: Express.Multer.File | null = file,
    ) =>
      runAsUser(reporter, () =>
        service.create({ ...dto, ...overrides } as never, upload),
      );
    const savedEvidence = () => evidences.save.mock.calls[0][0] as Evidence;

    it('crea un hallazgo abierto con quien reporta, supervisores y responsables', async () => {
      await expect(create()).resolves.toEqual({ id: 900 });

      expect(savedEvidence()).toMatchObject({
        status: STATUS_OPEN,
        imgEvidence: 'uuid-evidence.png',
        description: 'Derrame en pasillo',
        priorityDays: 7,
        manufacturingPlant: plant,
        user: reporter,
        supervisors: [supervisor],
        responsibles: [responsible],
      });
      expect(usersService.findOne).toHaveBeenCalledWith(reporter.id);
    });

    it('busca supervisores de la zona y responsables del proceso en esa planta', async () => {
      await create({ supervisor: 200 });

      expect(usersService.findSupervisor).toHaveBeenCalledWith({
        manufacturingPlantId: 1,
        zoneId: 3,
        supervisorId: 200,
      });
      expect(usersService.findProcesses).toHaveBeenCalledWith({
        manufacturingPlantId: 1,
        processId: 4,
        supervisorId: 200,
      });
    });

    it('una clasificación sin foto obligatoria, sin archivo, descripción ni prioridad guarda valores vacíos', async () => {
      mainTypesService.findOne.mockResolvedValue({
        id: 1,
        name: 'Comportamiento inseguro',
        requiresEvidence: false,
      } as never);

      await create({ description: '', priorityDays: undefined }, null);

      expect(savedEvidence()).toMatchObject({
        imgEvidence: '',
        description: '',
        priorityDays: null,
      });
    });

    // Antes la UI podía saltarse la foto y el API no lo validaba.
    it('con foto obligatoria y sin evidencia responde 400 y no guarda nada', async () => {
      await expect(create({}, null)).rejects.toThrow(
        new BadRequestException(
          'Debe capturar o adjuntar una imagen como evidencia del hallazgo',
        ),
      );
      expect(evidences.save).not.toHaveBeenCalled();
      expect(mail.sendCreate).not.toHaveBeenCalled();
    });

    // Decide la bandera, no el nombre: renombrar la clasificación no cambia nada.
    it('un "comportamiento inseguro" con la bandera en true también exige la foto', async () => {
      mainTypesService.findOne.mockResolvedValue({
        id: 1,
        name: 'Comportamiento inseguro',
        requiresEvidence: true,
      } as never);

      await expect(create({}, null)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(evidences.save).not.toHaveBeenCalled();
    });

    it('la fecha de creación es la de la planta: México usa la hora del servidor', async () => {
      const before = Date.now();

      await create();

      const { createdAt, updatedAt } = savedEvidence();
      expect(updatedAt).toBe(createdAt);
      expect(createdAt.getTime()).toBeGreaterThanOrEqual(before - 1000);
      expect(createdAt.getTime()).toBeLessThanOrEqual(Date.now() + 1000);
    });

    it('en una planta de Colombia la fecha se guarda en hora de Bogotá', async () => {
      const bogotaNow = new Date(
        new Date().toLocaleString('en-US', { timeZone: 'America/Bogota' }),
      );

      await runAsUser(
        buildUser({ ...reporter, manufacturingPlants: [plant, otherPlant] }),
        () =>
          service.create({ ...dto, manufacturingPlantId: 2 } as never, file),
      );

      const { createdAt } = savedEvidence();
      expect(Math.abs(createdAt.getTime() - bogotaNow.getTime())).toBeLessThan(
        5000,
      );
    });

    it('debe lanzar NotFoundException si la planta no es del usuario, sin consultar ni guardar', async () => {
      await expect(create({ manufacturingPlantId: 2 })).rejects.toThrow(
        new NotFoundException('Planta #2 no encontrada'),
      );
      expect(plants.findOne).not.toHaveBeenCalled();
      expect(evidences.save).not.toHaveBeenCalled();
    });

    it('debe lanzar BadRequestException y no guardar si la zona no tiene supervisor', async () => {
      usersService.findSupervisor.mockResolvedValue([]);

      await expect(create()).rejects.toThrow(
        new BadRequestException(
          'No se ha encontrado algun supervisor asignador para la planta Tepotzotlán, zona Almacén',
        ),
      );
      expect(evidences.save).not.toHaveBeenCalled();
      expect(mail.sendCreate).not.toHaveBeenCalled();
    });

    it('avisa por correo a los responsables y a los usuarios de la planta', async () => {
      await create();
      await flushBackgroundWork();

      const notified = mail.sendCreate.mock.calls.map(([{ user }]) => user.id);
      expect(notified.sort()).toEqual([responsible.id, plantUser.id].sort());
    });

    it('sin responsables avisa solo a los usuarios de la planta', async () => {
      usersService.findProcesses.mockResolvedValue([]);

      await create();
      await flushBackgroundWork();

      const notified = mail.sendCreate.mock.calls.map(([{ user }]) => user.id);
      expect(notified).toEqual([plantUser.id]);
    });

    it('en desarrollo todos los correos van a la cuenta de desarrollo', async () => {
      await setup(ENV_DEVELOPMENT);

      await create();
      await flushBackgroundWork();

      const notified = mail.sendCreate.mock.calls.map(([{ user }]) => user.id);
      expect(notified).toEqual([devUser.id, devUser.id]);
    });

    it('si falla un correo, el hallazgo queda creado, se avisa a los demás y el error queda en el log', async () => {
      const background = trackBackgroundEmails(service);
      mail.sendCreate.mockImplementation(async ({ user }) => {
        if (user.id === responsible.id) throw new Error('SMTP caído');
      });

      await expect(create()).resolves.toEqual({ id: 900 });

      await expect(background.rejections()).resolves.toEqual([]);
      expect(mail.sendCreate).toHaveBeenCalledWith(
        expect.objectContaining({ user: plantUser }),
      );
      expect(logError).toHaveBeenCalledWith(
        expect.stringContaining(
          `No se pudo enviar el correo de creación del hallazgo #900 a el usuario ${responsible.id}: SMTP caído`,
        ),
      );
    });

    it('si la planta no tiene usuarios a quién avisar, lo registra sin errores', async () => {
      const background = trackBackgroundEmails(service);
      usersService.findAllByPlant.mockResolvedValue([]);

      await expect(create()).resolves.toEqual({ id: 900 });

      await expect(background.rejections()).resolves.toEqual([]);
      expect(logWarn).toHaveBeenCalledWith(
        expect.stringContaining(
          'No se ha encontrado usuarios asignados para la planta Tepotzotlán',
        ),
      );
    });

    it('si no se pueden consultar los usuarios de la planta, lo registra sin errores', async () => {
      const background = trackBackgroundEmails(service);
      usersService.findAllByPlant.mockRejectedValue(new Error('BD caída'));

      await expect(create()).resolves.toEqual({ id: 900 });

      await expect(background.rejections()).resolves.toEqual([]);
      expect(logError).toHaveBeenCalledWith(
        expect.stringContaining('BD caída'),
      );
    });

    it('en desarrollo, si no existe la cuenta de desarrollo, lo registra sin errores', async () => {
      await setup(ENV_DEVELOPMENT);
      const background = trackBackgroundEmails(service);
      usersService.findOne.mockImplementation(async (id) => {
        if (id === 1) throw new NotFoundException();
        return reporter;
      });

      await expect(create()).resolves.toEqual({ id: 900 });

      await expect(background.rejections()).resolves.toEqual([]);
      expect(mail.sendCreate).not.toHaveBeenCalled();
    });
  });

  describe('findOne (solo hallazgos de las plantas del usuario)', () => {
    const evidence = () => buildEvidence({ id: 5, manufacturingPlant: plant });

    it('devuelve el hallazgo de una planta del usuario', async () => {
      const own = evidence();
      stored = [own];

      await expect(runAsUser(reporter, () => service.findOne(5))).resolves.toBe(
        own,
      );
    });

    it('debe lanzar NotFoundException si no existe', async () => {
      await expect(
        runAsUser(reporter, () => service.findOne(5)),
      ).rejects.toThrow(
        new NotFoundException('No se ha encontrado el hallazgo #5'),
      );
    });

    it('un hallazgo de otra planta responde el mismo 404 que uno inexistente', async () => {
      stored = [evidence()];

      await expect(
        runAsUser(outsider, () => service.findOne(5)),
      ).rejects.toThrow(
        new NotFoundException('No se ha encontrado el hallazgo #5'),
      );
    });

    it('un usuario sin plantas no ve ningún hallazgo (sin consultar la base)', async () => {
      stored = [evidence()];

      await expect(
        runAsUser(buildUser({ manufacturingPlants: [] }), () =>
          service.findOne(5),
        ),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(evidences.findOne).not.toHaveBeenCalled();
    });

    it('un administrador también se limita a sus plantas', async () => {
      stored = [evidence()];

      await expect(
        runAsUser(buildAdmin({ manufacturingPlants: [otherPlant] }), () =>
          service.findOne(5),
        ),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('findAll (listado REST y descargas)', () => {
    const findAll = (user: User, query = {}) =>
      runAsUser(user, () => service.findAll(query as never));
    const plantFilter = () =>
      operand(
        (
          evidences.find.mock.calls[0][0].where as {
            manufacturingPlant: { id: unknown };
          }
        ).manufacturingPlant.id,
      );
    const multiPlantUser = buildUser({
      manufacturingPlants: [plant, otherPlant],
    });

    it('sin filtro de planta lista las plantas del usuario', async () => {
      await findAll(multiPlantUser);

      expect(plantFilter()).toEqual([1, 2]);
    });

    it('con una planta propia lista solo esa', async () => {
      await findAll(multiPlantUser, { manufacturingPlantId: 2 });

      expect(plantFilter()).toEqual([2]);
    });

    it('con una planta ajena responde vacío sin consultar la base', async () => {
      await expect(
        findAll(reporter, { manufacturingPlantId: 2 }),
      ).resolves.toEqual([]);
      expect(evidences.find).not.toHaveBeenCalled();
    });
  });

  describe('findAll paginado (lista de Hallazgos del UI)', () => {
    const findPage = (user: User, query = {}) =>
      runAsUser(user, () =>
        service.findAll({ page: 1, limit: 10, ...query } as never),
      );

    it('con una planta ajena responde vacío sin consultar la base', async () => {
      await expect(
        findPage(reporter, { manufacturingPlantId: 2 }),
      ).resolves.toEqual({ data: [], count: 0 });
      expect(evidences.findAndCount).not.toHaveBeenCalled();
    });

    it('sin filtro de planta consulta solo las plantas del usuario', async () => {
      await findPage(reporter);

      const [{ where }] = evidences.findAndCount.mock.calls[0];
      expect(
        operand(
          (where as { manufacturingPlant: { id: unknown } }).manufacturingPlant
            .id,
        ),
      ).toEqual([1]);
    });

    it('pagina con skip/take y devuelve el total', async () => {
      const row = buildEvidence({ id: 5 });
      evidences.findAndCount.mockResolvedValue([[row], 42]);

      await expect(findPage(reporter, { page: 3, limit: 10 })).resolves.toEqual(
        { data: [row], count: 42 },
      );
      expect(evidences.findAndCount.mock.calls[0][0]).toMatchObject({
        skip: 20,
        take: 10,
      });
      expect(evidences.find).not.toHaveBeenCalled();
    });

    it('limit -1 devuelve todo sin paginar (con el total)', async () => {
      await findPage(reporter, { limit: -1 });

      const [options] = evidences.findAndCount.mock.calls[0];
      expect(options).not.toHaveProperty('take');
      expect(options).not.toHaveProperty('skip');
    });

    it('sin página ni límite devuelve la lista completa (descargas)', async () => {
      await expect(
        runAsUser(reporter, () => service.findAll({} as never)),
      ).resolves.toEqual([]);
      expect(evidences.find).toHaveBeenCalled();
      expect(evidences.findAndCount).not.toHaveBeenCalled();
    });
  });

  describe('saveProcessStart (iniciar "en progreso")', () => {
    const file = { filename: 'uuid-process.png' } as Express.Multer.File;
    let evidence: Evidence;

    beforeEach(() => {
      evidence = buildEvidence({
        id: 5,
        manufacturingPlant: plant,
        user: reporter,
        supervisors: [supervisor],
        responsibles: [responsible],
      });
      stored = [evidence];
      evidences.save.mockImplementation(async (e) => e as Evidence);
    });

    const start = (user: User, upload: Express.Multer.File | null = file) =>
      runAsUser(user, () => service.saveProcessStart(5, upload));

    it('debe lanzar BadRequestException si no se adjunta evidencia', async () => {
      await expect(start(supervisor, null)).rejects.toThrow(
        new BadRequestException(
          'Debe capturar o adjuntar evidencia para iniciar el proceso',
        ),
      );
      expect(evidences.findOne).not.toHaveBeenCalled();
    });

    it('debe lanzar NotFoundException si el hallazgo no existe', async () => {
      stored = [];

      await expect(start(supervisor)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('debe lanzar NotFoundException si el hallazgo es de otra planta', async () => {
      await expect(
        start(buildAdmin({ manufacturingPlants: [otherPlant] })),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(evidences.update).not.toHaveBeenCalled();
    });

    it('pasa el hallazgo a "en progreso" con la imagen y la fecha de inicio', async () => {
      const result = await start(supervisor);

      expect(result).toMatchObject({
        status: STATUS_IN_PROGRESS,
        imgProcess: 'uuid-process.png',
      });
      expect(result.startProcessDate).toBeInstanceOf(Date);
      expect(result.updatedAt).toBe(result.startProcessDate);
      expectGuardedUpdate(5, [STATUS_OPEN], {
        status: STATUS_IN_PROGRESS,
        imgProcess: 'uuid-process.png',
        startProcessDate: result.startProcessDate,
      });
    });

    it('registra quién lo inició (el usuario de la sesión)', async () => {
      const result = await start(supervisor);

      expectGuardedUpdate(5, [STATUS_OPEN], {
        startedBy: expect.objectContaining({ id: supervisor.id }),
      });
      expect(result.startedBy).toMatchObject({
        id: supervisor.id,
        name: supervisor.name,
      });
      expect(result.closedBy).toBeUndefined();
    });

    it('avisa a quien reportó, indicando quién lo inició', async () => {
      await start(supervisor);

      expect(mail.sendInProgress).toHaveBeenCalledWith({
        user: reporter,
        startedBy: expect.objectContaining({ id: supervisor.id }),
        evidenceCurrent: evidence,
      });
    });

    it('espera a registrar la notificacion antes de confirmar la operacion', async () => {
      let finish!: () => void;
      mail.sendInProgress.mockReturnValue(
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
      );
      const operation = start(supervisor);
      await flushBackgroundWork();
      let resolved = false;
      void operation.then(() => {
        resolved = true;
      });
      await flushBackgroundWork();
      expect(resolved).toBe(false);
      finish();
      await expect(operation).resolves.toMatchObject({
        status: STATUS_IN_PROGRESS,
      });
      expect(mail.withOutbox).toHaveBeenCalledTimes(1);
    });

    it('propaga un fallo de persistencia del correo para abortar la transaccion', async () => {
      Object.defineProperty(mail, 'capturingMail', {
        value: true,
        configurable: true,
      });
      mail.sendInProgress.mockRejectedValue(new Error('outbox unavailable'));
      await expect(start(supervisor)).rejects.toThrow('outbox unavailable');
    });

    it('responde 409 si ya se había registrado el inicio (dato inconsistente)', async () => {
      evidence.imgProcess = 'ya-iniciado.png';

      await expect(start(supervisor)).rejects.toThrow(
        new ConflictException(
          'El estatus en progreso ya fue registrado para este hallazgo',
        ),
      );
      expect(evidences.update).not.toHaveBeenCalled();
    });

    it.each([STATUS_IN_PROGRESS, STATUS_CLOSE, STATUS_CANCEL])(
      'responde 409 si el hallazgo está "%s"',
      async (status) => {
        evidence.status = status;

        await expect(start(supervisor)).rejects.toThrow(
          new ConflictException(
            `No se puede iniciar en progreso el hallazgo #5 porque está en estado "${status}"`,
          ),
        );
        expect(evidences.update).not.toHaveBeenCalled();
        expect(mail.sendInProgress).not.toHaveBeenCalled();
      },
    );

    it('responde 409 sin avisar si otra petición lo cambió antes de guardar', async () => {
      evidences.update.mockResolvedValueOnce({ affected: 0 } as never);

      await expect(start(supervisor)).rejects.toThrow(
        new ConflictException(
          'No se puede iniciar en progreso el hallazgo #5 porque su estado cambió; recargue e intente de nuevo',
        ),
      );
      expect(mail.sendInProgress).not.toHaveBeenCalled();
    });

    describe('detalles de permisos', () => {
      it('reconoce al supervisor aunque su id venga como texto (relación de TypeORM)', async () => {
        evidence.supervisors = [
          { ...supervisor, id: '200' } as unknown as User,
        ];

        await expect(start(supervisor)).resolves.toMatchObject({
          status: STATUS_IN_PROGRESS,
        });
      });

      it('sin permiso no guarda ni avisa', async () => {
        await expect(start(reporter)).rejects.toThrow(
          new ForbiddenException(
            'No tiene permisos para iniciar el estatus en progreso',
          ),
        );
        expect(evidences.update).not.toHaveBeenCalled();
        expect(mail.sendInProgress).not.toHaveBeenCalled();
      });

      it.each([
        ['"administrador" en minúsculas', ROLE_ADMINISTRADOR.toLowerCase()],
        ['"supervisor" en minúsculas', ROLE_SUPERVISOR.toLowerCase()],
      ])(
        'el rol se compara exacto: %s (asignado) no da permiso',
        async (_c, role) => {
          const user = buildUser({ id: 997, role, ...inPlant });
          evidence.supervisors = [user];

          await expect(start(user)).rejects.toBeInstanceOf(ForbiddenException);
        },
      );
    });
  });

  describe('flujo C2: cerrar, cancelar, reasignar y comentar', () => {
    const ACTIVE = [STATUS_OPEN, STATUS_IN_PROGRESS];
    const FINAL = [STATUS_CLOSE, STATUS_CANCEL];
    let evidence: Evidence;

    beforeEach(() => {
      evidence = buildEvidence({
        id: 7,
        manufacturingPlant: plant,
        user: reporter,
        supervisors: [supervisor],
        responsibles: [responsible],
      });
      stored = [evidence];
      evidences.save.mockImplementation(async (e) => e as Evidence);
    });

    const conflict = (action: string, status: string) =>
      new ConflictException(
        `No se puede ${action} el hallazgo #7 porque está en estado "${status}"`,
      );
    const raceConflict = (action: string) =>
      new ConflictException(
        `No se puede ${action} el hallazgo #7 porque su estado cambió; recargue e intente de nuevo`,
      );

    describe('saveSolution (cerrar)', () => {
      const file = { filename: 'uuid-solution.png' } as Express.Multer.File;
      const close = (
        user: User,
        upload: Express.Multer.File | null = file,
        description = 'Se limpió el pasillo',
      ) => runAsUser(user, () => service.saveSolution(7, upload, description));

      it.each(ACTIVE)(
        'cierra un hallazgo "%s" con imagen, descripción y fecha',
        async (status) => {
          evidence.status = status;

          const result = await close(supervisor);

          expect(result).toMatchObject({
            status: STATUS_CLOSE,
            imgSolution: 'uuid-solution.png',
            descriptionSolution: 'Se limpió el pasillo',
          });
          expect(result.solutionDate).toBeInstanceOf(Date);
          expect(result.updatedAt).toBe(result.solutionDate);
          expectGuardedUpdate(7, ACTIVE, {
            status: STATUS_CLOSE,
            imgSolution: 'uuid-solution.png',
            solutionDate: result.solutionDate,
            // Quién lo cerró (el usuario de la sesión).
            closedBy: expect.objectContaining({
              id: supervisor.id,
              name: supervisor.name,
            }),
          });
          await flushBackgroundWork();
          expect(mail.sendSolution).toHaveBeenCalledTimes(1);
          expect(mail.sendSolution).toHaveBeenCalledWith({
            user: reporter,
            evidenceCurrent: result,
          });
          expect(usersService.findAllByPlant).not.toHaveBeenCalled();
        },
      );

      it('registra las notificaciones dentro de la transaccion', async () => {
        mail.sendSolution.mockResolvedValue(undefined);

        await expect(close(supervisor)).resolves.toMatchObject({
          status: STATUS_CLOSE,
        });
        await flushBackgroundWork();
        expect(mail.sendSolution).toHaveBeenCalled();
      });

      it('sin foto obligatoria, sin imagen ni descripción guarda textos vacíos', async () => {
        evidence.mainType.requiresEvidence = false;

        await expect(close(supervisor, null, '')).resolves.toMatchObject({
          imgSolution: '',
          descriptionSolution: '',
        });
      });

      // Misma regla que al crear: la clasificación decide.
      it('con foto obligatoria y sin imagen responde 400 sin cerrar ni avisar', async () => {
        await expect(close(supervisor, null)).rejects.toThrow(
          new BadRequestException(
            'Debe capturar o adjuntar una imagen como evidencia del hallazgo',
          ),
        );
        expect(evidences.update).not.toHaveBeenCalled();
        await flushBackgroundWork();
        expect(mail.sendSolution).not.toHaveBeenCalled();
      });

      it('sin permiso responde 403 antes de revisar la imagen', async () => {
        await expect(close(reporter, null)).rejects.toBeInstanceOf(
          ForbiddenException,
        );
      });

      it.each(FINAL)(
        'responde 409 si el hallazgo está "%s"',
        async (status) => {
          evidence.status = status;

          await expect(close(supervisor)).rejects.toThrow(
            conflict('cerrar', status),
          );
          expect(evidences.update).not.toHaveBeenCalled();
          expect(mail.sendSolution).not.toHaveBeenCalled();
        },
      );

      it('responde 409 sin avisar si otra petición lo cerró antes', async () => {
        evidences.update.mockResolvedValueOnce({ affected: 0 } as never);

        await expect(close(supervisor)).rejects.toThrow(raceConflict('cerrar'));
        expect(mail.sendSolution).not.toHaveBeenCalled();
      });

      it('responde 404 si el hallazgo es de otra planta', async () => {
        await expect(close(outsider)).rejects.toBeInstanceOf(NotFoundException);
        expect(evidences.update).not.toHaveBeenCalled();
      });

      it('sin permiso responde 403 aunque el hallazgo ya esté cerrado', async () => {
        evidence.status = STATUS_CLOSE;

        await expect(close(reporter)).rejects.toThrow(
          new ForbiddenException('No tiene permisos para cerrar este hallazgo'),
        );
      });
    });

    describe('remove (cancelar)', () => {
      const cancel = (user: User) => runAsUser(user, () => service.remove(7));

      it.each(ACTIVE)(
        'un administrador cancela un hallazgo "%s"',
        async (status) => {
          evidence.status = status;

          await expect(cancel(buildAdmin(inPlant))).resolves.toMatchObject({
            status: STATUS_CANCEL,
            isActive: false,
          });
          expectGuardedUpdate(7, ACTIVE, {
            status: STATUS_CANCEL,
            isActive: false,
          });
          await flushBackgroundWork();
          expect(mail.sendCancel).toHaveBeenCalled();
        },
      );

      it('registra las notificaciones dentro de la transaccion', async () => {
        mail.sendCancel.mockResolvedValue(undefined);

        await expect(cancel(buildAdmin(inPlant))).resolves.toMatchObject({
          status: STATUS_CANCEL,
        });
        await flushBackgroundWork();
        expect(mail.sendCancel).toHaveBeenCalled();
      });

      it('lo puede cancelar un correo con permiso de cancelación', async () => {
        await expect(
          cancel(buildUser({ email: 'gsanchez@hadamexico.com', ...inPlant })),
        ).resolves.toMatchObject({ status: STATUS_CANCEL });
      });

      it('un supervisor del hallazgo no puede cancelar (403)', async () => {
        await expect(cancel(supervisor)).rejects.toThrow(
          new ForbiddenException(
            'No tiene permisos para cancelar este hallazgo',
          ),
        );
        expect(evidences.update).not.toHaveBeenCalled();
      });

      it.each(FINAL)(
        'responde 409 si el hallazgo está "%s"',
        async (status) => {
          evidence.status = status;

          await expect(cancel(buildAdmin(inPlant))).rejects.toThrow(
            conflict('cancelar', status),
          );
          expect(evidences.update).not.toHaveBeenCalled();
          expect(mail.sendCancel).not.toHaveBeenCalled();
        },
      );

      it('responde 409 sin avisar si otra petición lo cambió antes', async () => {
        evidences.update.mockResolvedValueOnce({ affected: 0 } as never);

        await expect(cancel(buildAdmin(inPlant))).rejects.toThrow(
          raceConflict('cancelar'),
        );
        expect(mail.sendCancel).not.toHaveBeenCalled();
      });

      it('responde 404 si el hallazgo es de otra planta', async () => {
        await expect(
          cancel(buildAdmin({ manufacturingPlants: [otherPlant] })),
        ).rejects.toBeInstanceOf(NotFoundException);
        expect(evidences.update).not.toHaveBeenCalled();
      });
    });

    describe('reassignResponsibles (reasignar)', () => {
      const newResponsible = buildUser({ id: 301, ...inPlant });

      beforeEach(() => {
        evidences.save.mockImplementation(async (patch) =>
          Object.assign(evidence, patch),
        );
        const users = new Map<number, User>([
          [responsible.id, responsible],
          [newResponsible.id, newResponsible],
          [outsider.id, outsider],
        ]);
        usersService.findOne.mockImplementation(async (id) => users.get(id));
      });

      const reassign = (user: User, responsibleIds: number[]) =>
        runAsUser(user, () =>
          service.reassignResponsibles(7, { responsibleIds } as never),
        );

      it.each(ACTIVE)(
        'reasigna un hallazgo "%s" sin cambiar su estado y avisa a ambos',
        async (status) => {
          evidence.status = status;

          const result = await reassign(supervisor, [newResponsible.id]);

          expect(result.status).toBe(status);
          expect(result.responsibles).toEqual([newResponsible]);
          expect(evidences.save).toHaveBeenCalledWith(
            expect.objectContaining({
              id: evidence.id,
              responsibles: evidence.responsibles,
            }),
          );
          await flushBackgroundWork();
          expect(mail.sendReassign).toHaveBeenCalledTimes(2);
        },
      );

      // Antes no se registraba quién reasignaba.
      it('registra quién reasignó y cuándo', async () => {
        await reassign(supervisor, [newResponsible.id]);

        expect(evidences.save).toHaveBeenCalledWith(
          expect.objectContaining({
            reassignedBy: { id: supervisor.id },
            reassignedAt: expect.any(Date),
          }),
        );
      });

      it('registra las notificaciones dentro de la transaccion', async () => {
        mail.sendReassign.mockResolvedValue(undefined);

        await expect(
          reassign(supervisor, [newResponsible.id]),
        ).resolves.toMatchObject({ responsibles: [newResponsible] });
        await flushBackgroundWork();
        // Se registran ambos destinatarios antes del commit.
        expect(mail.sendReassign).toHaveBeenCalledTimes(2);
      });

      it.each(FINAL)(
        'responde 409 si el hallazgo está "%s"',
        async (status) => {
          evidence.status = status;

          await expect(
            reassign(supervisor, [newResponsible.id]),
          ).rejects.toThrow(conflict('reasignar', status));
          expect(evidences.save).not.toHaveBeenCalled();
          expect(mail.sendReassign).not.toHaveBeenCalled();
        },
      );

      it('rechaza un cierre concurrente antes de guardar responsables', async () => {
        const original = evidences.findOne.getMockImplementation();
        evidences.findOne.mockImplementation(async (options) => {
          const row = await original(options);
          return options.lock
            ? ({ ...row, status: STATUS_CLOSE } as Evidence)
            : row;
        });
        await expect(reassign(supervisor, [newResponsible.id])).rejects.toThrow(
          ConflictException,
        );
        expect(evidences.save).not.toHaveBeenCalled();
        expect(mail.sendReassign).not.toHaveBeenCalled();
      });

      it('responde 400 si el nuevo responsable no es de la planta', async () => {
        await expect(reassign(supervisor, [outsider.id])).rejects.toThrow(
          new BadRequestException(
            `Los usuarios ${outsider.id} no pertenecen a la planta del hallazgo`,
          ),
        );
        expect(evidences.save).not.toHaveBeenCalled();
      });

      it('quien solo reportó no puede reasignar (403)', async () => {
        await expect(
          reassign(reporter, [newResponsible.id]),
        ).rejects.toBeInstanceOf(ForbiddenException);
      });
    });

    describe('addComment (comentar)', () => {
      const comment = (user: User) =>
        runAsUser(user, () =>
          service.addComment(7, { comment: 'Revisado en sitio' }),
        );

      it.each([...ACTIVE, ...FINAL])(
        'se puede comentar un hallazgo "%s"',
        async (status) => {
          evidence.status = status;

          await expect(comment(reporter)).resolves.toBe(evidence);
          expect(comments.save).toHaveBeenCalledWith(
            expect.objectContaining({
              comment: 'Revisado en sitio',
              user: expect.objectContaining({ id: reporter.id }),
              evidence,
            }),
          );
          expect(evidences.update).toHaveBeenCalledWith(7, {
            updatedAt: expect.any(Date),
          });
        },
      );

      it('responde 404 si el hallazgo es de otra planta', async () => {
        await expect(comment(outsider)).rejects.toBeInstanceOf(
          NotFoundException,
        );
        expect(comments.save).not.toHaveBeenCalled();
      });
    });
  });

  /**
   * Quién puede hacer cada acción. Es la misma regla que el menú de acciones
   * del UI (TableEvidences). "Asignado" = supervisor o responsable del hallazgo.
   */
  describe('permisos por rol y acción', () => {
    const supervisorAsResponsible = buildSupervisor({ id: 210, ...inPlant });
    const adminAsResponsible = buildAdmin({ id: 220, ...inPlant });
    const generalAsSupervisor = buildUser({ id: 230, ...inPlant });

    type Action = 'iniciar' | 'cerrar' | 'reasignar' | 'cancelar';
    const run: Record<Action, (user: User) => Promise<unknown>> = {
      iniciar: (user) =>
        runAsUser(user, () =>
          service.saveProcessStart(8, {
            filename: 'p.png',
          } as Express.Multer.File),
        ),
      cerrar: (user) =>
        runAsUser(user, () =>
          service.saveSolution(
            8,
            { filename: 's.png' } as Express.Multer.File,
            'ok',
          ),
        ),
      reasignar: (user) =>
        runAsUser(user, () =>
          service.reassignResponsibles(8, {
            responsibleIds: [responsible.id],
          } as never),
        ),
      cancelar: (user) => runAsUser(user, () => service.remove(8)),
    };

    beforeEach(() => {
      stored = [
        buildEvidence({
          id: 8,
          manufacturingPlant: plant,
          user: reporter,
          supervisors: [supervisor, generalAsSupervisor],
          responsibles: [
            responsible,
            supervisorAsResponsible,
            adminAsResponsible,
          ],
        }),
      ];
      evidences.save.mockImplementation(async (e) => e as Evidence);
      usersService.findOne.mockResolvedValue(responsible);
    });

    // [quién, usuario, iniciar, cerrar, reasignar, cancelar]
    const matrix: [string, () => User, boolean, boolean, boolean, boolean][] = [
      [
        'Administrador no asignado',
        () => buildAdmin({ id: 600, ...inPlant }),
        true,
        false,
        true,
        true,
      ],
      [
        'Administrador asignado como responsable',
        () => adminAsResponsible,
        true,
        false,
        true,
        true,
      ],
      [
        'correo especial (rol General, no asignado)',
        () =>
          buildUser({ id: 610, email: 'klarios@hadamexico.com', ...inPlant }),
        true,
        true,
        true,
        false,
      ],
      [
        'correo especial y de cancelación (rol General)',
        () => buildUser({ id: 615, email: 'sst@hadamexico.com', ...inPlant }),
        true,
        true,
        true,
        true,
      ],
      [
        'correo de cancelación (rol General, no asignado)',
        () =>
          buildUser({ id: 620, email: 'dtrujillo@hadamexico.com', ...inPlant }),
        false,
        false,
        false,
        true,
      ],
      [
        'Supervisor asignado como supervisor',
        () => supervisor,
        true,
        true,
        true,
        false,
      ],
      [
        'Supervisor asignado como responsable',
        () => supervisorAsResponsible,
        true,
        true,
        true,
        false,
      ],
      [
        'General asignado como responsable',
        () => responsible,
        false,
        false,
        true,
        false,
      ],
      [
        'General asignado como supervisor',
        () => generalAsSupervisor,
        false,
        false,
        true,
        false,
      ],
      [
        'Supervisor no asignado',
        () => buildSupervisor({ id: 640, ...inPlant }),
        false,
        false,
        false,
        false,
      ],
      ['General que solo reportó', () => reporter, false, false, false, false],
    ];

    const cases = matrix.flatMap(([who, user, ...allowed]) =>
      (['iniciar', 'cerrar', 'reasignar', 'cancelar'] as const).map(
        (action, i) => [who, action, allowed[i], user] as const,
      ),
    );

    it.each(cases)('%s → %s: %s', async (_who, action, allowed, user) => {
      const result = run[action](user());

      if (allowed) {
        await expect(result).resolves.toBeDefined();
      } else {
        await expect(result).rejects.toBeInstanceOf(ForbiddenException);
        expect(evidences.update).not.toHaveBeenCalled();
        expect(evidences.save).not.toHaveBeenCalled();
      }
    });
  });

  describe('destinatarios del correo de solución', () => {
    const notify = (plantId: number, type = 'solution', creator = reporter) => {
      const manufacturingPlant = buildManufacturingPlant({ id: plantId });
      return runAsUser(supervisor, () =>
        service.notifyByEmail({
          manufacturingPlant,
          evidenceCurrent: buildEvidence({
            id: 40,
            manufacturingPlant,
            user: creator,
            supervisors: [supervisor],
            responsibles: [responsible],
          }),
          type,
        }),
      );
    };

    it.each([1, 2, 4])(
      'planta %s: avisa solo al creador, sin consultar usuarios de la planta',
      async (plantId) => {
        await notify(plantId);

        expect(
          mail.sendSolution.mock.calls.map(([{ user }]) => user.id),
        ).toEqual([reporter.id]);
        expect(usersService.findAllByPlant).not.toHaveBeenCalled();
      },
    );

    it('planta 3: conserva los destinatarios de findAllByPlant', async () => {
      usersService.findAllByPlant.mockResolvedValue([plantUser, responsible]);

      await notify(3);

      expect(usersService.findAllByPlant).toHaveBeenCalledWith(3);
      expect(mail.sendSolution.mock.calls.map(([{ user }]) => user.id)).toEqual(
        [plantUser.id, responsible.id],
      );
    });

    it('sin correo del creador no usa a los usuarios de la planta como alternativa', async () => {
      await notify(1, 'solution', buildUser({ id: reporter.id, email: '' }));

      expect(mail.sendSolution).not.toHaveBeenCalled();
      expect(usersService.findAllByPlant).not.toHaveBeenCalled();
      expect(logWarn).toHaveBeenCalledWith(
        expect.stringContaining('No se ha encontrado el creador con correo'),
      );
    });

    it.each(['create', 'cancel'])(
      '%s conserva los destinatarios de la planta',
      async (type) => {
        await notify(1, type);

        expect(usersService.findAllByPlant).toHaveBeenCalledWith(1);
        const sent = type === 'create' ? mail.sendCreate : mail.sendCancel;
        expect(sent).toHaveBeenCalledTimes(1);
        expect(sent).toHaveBeenCalledWith(
          expect.objectContaining({ user: plantUser }),
        );
      },
    );

    it.each([1, 3])(
      'en desarrollo mantiene la cuenta de pruebas (planta %s)',
      async (plantId) => {
        await setup(ENV_DEVELOPMENT);

        await notify(plantId);

        expect(
          mail.sendSolution.mock.calls.map(([{ user }]) => user.id),
        ).toEqual([devUser.id]);
      },
    );
  });

  describe('C3: contenido de cada correo', () => {
    const evidence = () =>
      buildEvidence({ id: 40, manufacturingPlant: plant, user: reporter });
    const send = (type: string, extra?: object) =>
      runAsUser(supervisor, () =>
        service.sendEmailUsers([responsible], evidence(), type, extra),
      );

    it('cancelación: indica quién canceló', async () => {
      await send('cancel');

      expect(mail.sendCancel).toHaveBeenCalledWith({
        cancelledBy: expect.objectContaining({ id: supervisor.id }),
        user: responsible,
        evidenceCurrent: expect.objectContaining({ id: 40 }),
      });
    });

    it('solución: avisa a cada destinatario', async () => {
      await send('solution');

      expect(mail.sendSolution).toHaveBeenCalledWith({
        user: responsible,
        evidenceCurrent: expect.objectContaining({ id: 40 }),
      });
    });

    it('reasignación: manda responsables anteriores y actuales', async () => {
      await send('reassign', {
        reassignedBy: reporter,
        previousResponsibles: [responsible],
        currentResponsibles: [plantUser],
      });

      expect(mail.sendReassign).toHaveBeenCalledWith({
        user: responsible,
        reassignedBy: reporter,
        evidenceCurrent: expect.objectContaining({ id: 40 }),
        previousResponsibles: [responsible],
        currentResponsibles: [plantUser],
      });
    });

    it('reasignación sin datos extra: la hace quien está en sesión, con listas vacías', async () => {
      await send('reassign');

      expect(mail.sendReassign).toHaveBeenCalledWith(
        expect.objectContaining({
          reassignedBy: expect.objectContaining({ id: supervisor.id }),
          previousResponsibles: [],
          currentResponsibles: [],
        }),
      );
    });

    it('un tipo desconocido no envía nada', async () => {
      await send('otro');

      for (const method of [
        'sendCreate',
        'sendCancel',
        'sendSolution',
        'sendReassign',
      ] as const) {
        expect(mail[method]).not.toHaveBeenCalled();
      }
    });
  });

  describe('C5: filtros de findAll', () => {
    const where = () =>
      evidences.find.mock.calls[0][0].where as Record<string, unknown>;
    const findAll = (query: object) =>
      runAsUser(reporter, () => service.findAll(query as never));

    it('sin filtros solo limita por planta (activa)', async () => {
      await findAll({});

      expect(Object.keys(where())).toEqual(['manufacturingPlant']);
      expect(where().manufacturingPlant).toMatchObject({ isActive: true });
      expect(evidences.find.mock.calls[0][0].order).toEqual({ id: 'DESC' });
    });

    it('combina filtros simples y listas sin repetir valores', async () => {
      await findAll({
        id: 5,
        ids: '5,6',
        mainTypeId: 1,
        mainTypeIds: '1,2',
        secondaryType: 3,
        secondaryTypeIds: '4',
        area: 7,
        areaIds: '8',
        zone: 9,
        zoneIds: '10',
        process: 11,
        processIds: '12',
        responsible: 13,
        responsibleIds: '14',
        status: 'Abierto',
        statuses: 'Cerrado, Abierto',
      });

      const w = where() as Record<string, Record<string, unknown>>;
      expect(operand(w.id)).toEqual([5, 6]);
      expect(operand(w.mainType.id)).toEqual([1, 2]);
      expect(operand(w.secondaryType.id)).toEqual([4, 3]);
      expect(operand(w.zone.id)).toEqual([10, 9]);
      expect(operand((w.zone.area as { id: unknown }).id)).toEqual([8, 7]);
      expect(operand(w.process.id)).toEqual([12, 11]);
      expect(operand(w.responsibles.id)).toEqual([14, 13]);
      expect(operand(w.status)).toEqual(['Cerrado', 'Abierto']);
    });

    it('descarta ids no válidos y estatus vacíos de las listas', async () => {
      await findAll({ ids: '3, x,0,-1', statuses: ' , Abierto' });

      expect(operand(where().id)).toEqual([3]);
      expect(operand(where().status)).toEqual(['Abierto']);
    });

    it('solo área (sin lugar) filtra por el área del lugar', async () => {
      await findAll({ area: 7 });

      expect(where().zone).not.toHaveProperty('id');
      expect(
        operand((where().zone as { area: { id: unknown } }).area.id),
      ).toEqual([7]);
    });

    describe('fechas (DD/MM/YYYY)', () => {
      const createdAt = () => where().createdAt as FindOperator<Date[] | Date>;

      it('inicio y fin: entre el inicio del primer día y el final del último', async () => {
        await findAll({ startDate: '01/10/2026', endDate: '15/10/2026' });

        expect(createdAt().type).toBe('between');
        const [start, end] = createdAt().value as Date[];
        expect(start).toEqual(new Date(2026, 9, 1, 0, 0, 0, 0));
        expect(end).toEqual(new Date(2026, 9, 15, 23, 59, 59, 999));
      });

      it('solo inicio: desde ese día hasta ahora', async () => {
        await findAll({ startDate: '01/10/2026' });

        expect(createdAt().type).toBe('between');
        const [, end] = createdAt().value as Date[];
        expect(Date.now() - end.getTime()).toBeLessThan(5_000);
      });

      it('solo fin: hasta el final de ese día', async () => {
        await findAll({ endDate: '15/10/2026' });

        expect(createdAt().type).toBe('lessThanOrEqual');
        expect(createdAt().value).toEqual(
          new Date(2026, 9, 15, 23, 59, 59, 999),
        );
      });

      it.each([
        [
          'un formato inválido',
          { startDate: '2026-10-01' },
          'La fecha de inicio debe tener el formato DD/MM/YYYY',
        ],
        [
          'un día que no existe',
          { endDate: '31/02/2026' },
          'La fecha de fin debe tener el formato DD/MM/YYYY',
        ],
        [
          'inicio después del fin',
          { startDate: '02/10/2026', endDate: '01/10/2026' },
          'La fecha de inicio no puede ser mayor a la fecha de fin',
        ],
      ])('responde 400 con %s', async (_c, query, message) => {
        await expect(findAll(query)).rejects.toThrow(
          new BadRequestException(message),
        );
        expect(evidences.find).not.toHaveBeenCalled();
      });
    });
  });

  describe('C5: descargas', () => {
    const listed = () =>
      buildEvidence({
        id: 77,
        manufacturingPlant: plant,
        user: reporter,
        supervisors: [supervisor],
        responsibles: [responsible],
        status: STATUS_CLOSE,
        isActive: true,
        imgEvidence: 'no-existe.png',
        imgSolution: '',
      });
    const response = () => ({
      setHeader: jest.fn(),
      send: jest.fn(),
      writeHead: jest.fn(),
      end: jest.fn(),
    });
    type FakeResponse = ReturnType<typeof response>;
    let namesById: Map<number, string>;

    beforeEach(() => {
      evidences.find.mockResolvedValue([listed()]);
      // Excel: una sola consulta con los nombres ya resueltos.
      evidences.query.mockResolvedValue([
        {
          id: 77,
          status: STATUS_CLOSE,
          isActive: true,
          manufacturingPlant: 'Tepotzotl\u00e1n',
          mainType: 'Condici\u00f3n insegura',
          secondaryType: 'Piso mojado',
          zone: 'Almac\u00e9n',
          user: reporter.name,
          process: null,
          country: 'M\u00e9xico',
          createdAt: '2026-10-01 09:30:00',
          solutionDate: null,
          supervisors: supervisor.name,
          responsibles: responsible.name,
        },
      ]);
      namesById = new Map([
        [1, 'Tepotzotlán'],
        [2, 'Condición insegura'],
        [12, 'Producción'],
      ]);
      Object.assign(evidences, {
        manager: {
          getRepository: () => ({
            findBy: async ({ id }: { id: FindOperator<number[]> }) =>
              (id.value as number[])
                .filter((value) => namesById.has(value))
                .map((value) => ({ id: value, name: namesById.get(value) })),
          }),
        },
      });
    });

    const download = async (type: string, query: object = {}) => {
      const res = response();
      await runAsUser(reporter, () =>
        service.downloadFile(type, query as never, res as never),
      );
      return res;
    };
    // El Excel se escribe en streaming: respuesta escribible que junta el archivo.
    const PERIOD = { startDate: '01/01/2026', endDate: '31/12/2026' };
    const excelResponse = () => {
      const chunks: Buffer[] = [];
      const res = Object.assign(
        new Writable({
          write(chunk: Buffer, _encoding, callback) {
            chunks.push(Buffer.from(chunk));
            callback();
          },
        }),
        { setHeader: jest.fn() },
      );
      const body = () =>
        res.writableFinished
          ? Promise.resolve(Buffer.concat(chunks))
          : new Promise<Buffer>((resolve) =>
              res.once('finish', () => resolve(Buffer.concat(chunks))),
            );
      return { res, body };
    };
    type ExcelResponse = ReturnType<typeof excelResponse>['res'];
    const downloadXlsx = async (query: object = {}) => {
      const { res, body } = excelResponse();
      await runAsUser(reporter, () =>
        service.downloadFile(
          'xlsx',
          { ...PERIOD, ...query } as never,
          res as never,
        ),
      );
      return { res, file: await body() };
    };
    const dispositionOf = (res: FakeResponse | ExcelResponse) =>
      res.setHeader.mock.calls.find(
        ([name]) => name === 'Content-Disposition',
      )[1] as string;

    it('un tipo no soportado responde 400 sin consultar (antes la petición quedaba colgada)', async () => {
      await expect(download('csv')).rejects.toThrow(
        new BadRequestException(
          'Tipo de archivo no soportado: csv. Use xlsx o pdf',
        ),
      );
      expect(evidences.find).not.toHaveBeenCalled();
    });

    describe('xlsx', () => {
      const workbookOf = (file: Buffer) => XlsxPopulate.fromDataAsync(file);

      it.each([
        ['sin período', {}, 'Seleccione el período a exportar'],
        ['solo con fecha de inicio', { startDate: '01/01/2026' }, 'Seleccione'],
        [
          'el inicio después del fin',
          { startDate: '02/01/2026', endDate: '01/01/2026' },
          'no puede ser mayor',
        ],
        [
          'más de 12 meses',
          { startDate: '01/01/2026', endDate: '01/01/2027' },
          'no puede superar 12 meses',
        ],
      ])(
        'responde 400 %s, sin consultar ni escribir el archivo',
        async (_case, query, message) => {
          const { res } = excelResponse();
          await expect(
            runAsUser(reporter, () =>
              service.downloadFile('xlsx', query as never, res as never),
            ),
          ).rejects.toThrow(message);
          expect(evidences.find).not.toHaveBeenCalled();
          expect(res.setHeader).not.toHaveBeenCalled();
        },
      );

      it('acepta exactamente 12 meses (01/01 al 31/12)', async () => {
        const { file } = await downloadXlsx();

        expect(file.subarray(0, 2).toString()).toBe('PK');
      });

      it('trae los datos en una sola consulta y filtra la columna de responsables', async () => {
        await downloadXlsx({ responsibleIds: `${responsible.id}` });
        await downloadXlsx();

        expect(evidences.query).toHaveBeenCalledTimes(2);
        const [[, withFilter], [, withoutFilter]] = evidences.query.mock.calls;
        expect(withFilter).toEqual([[77], [responsible.id]]);
        expect(withoutFilter).toEqual([[77], null]);
      });

      it('genera la hoja de hallazgos con relaciones, activo y fecha en la zona pedida', async () => {
        const { file } = await downloadXlsx({ timeZone: 'America/Bogota' });
        const sheet = (await workbookOf(file)).sheet('Hallazgos');

        expect(sheet.cell('A1').value()).toBe('ID');
        expect(sheet.cell('I1').value()).toBe('Fecha de creación (UTC-05)');
        expect(sheet.cell('A2').value()).toBe(77);
        expect(sheet.cell('B2').value()).toBe(STATUS_CLOSE);
        expect(sheet.cell('C2').value()).toBe(1);
        expect(sheet.cell('D2').value()).toBe('Tepotzotlán');
        expect(sheet.cell('K2').value()).toBe('Supervisor');
        expect(sheet.cell('L2').value()).toBe('Responsable');
        // 09:30 en hora de México (UTC-6) = 10:30 en Bogotá (UTC-5).
        const serial = sheet.cell('I2').value() as number;
        const minutes = Math.round((serial - Math.floor(serial)) * 24 * 60);
        expect(minutes).toBe(10 * 60 + 30);
        // Sin fecha de solución guardada: celda vacía.
        expect(sheet.cell('J2').value()).toBeUndefined();
      });

      it('agrega la hoja de filtros aplicados con nombres legibles', async () => {
        const { file } = await downloadXlsx({
          manufacturingPlantId: 1,
          mainTypeIds: '2,99',
          processIds: '12',
        });
        const rows = (await workbookOf(file))
          .sheet('Filtros')
          .usedRange()
          .value() as string[][];
        const byField = Object.fromEntries(
          rows.map(([field, value]) => [field, value]),
        );

        expect(byField['Descargado por']).toBe(reporter.name);
        expect(byField['Total de registros']).toBe(1);
        expect(byField['Planta']).toBe('Tepotzotlán');
        expect(byField['Clasificación']).toBe('Condición insegura, ID 99');
        expect(byField['Estatus']).toBe('(todos)');
        expect(byField['Proceso']).toBe('Producción');
        expect(byField['Fecha inicio']).toBe(PERIOD.startDate);
        expect(byField['Fecha fin']).toBe(PERIOD.endDate);
      });

      it('nombra el archivo con la planta y cuántos filtros extra se aplicaron', async () => {
        const { res } = await downloadXlsx({
          manufacturingPlantId: 1,
          statuses: 'Abierto',
          startDate: '01/10/2026',
        });

        expect(res.setHeader).toHaveBeenCalledWith(
          'Content-Type',
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        );
        // Estatus, fecha de inicio y fecha de fin.
        expect(dispositionOf(res)).toMatch(
          /filename="Hallazgos_Tepotzotl.*_\+3filtros_.*\.xlsx"/,
        );
      });

      it('sin planta el archivo dice "Todas"; sin resultados no consulta los datos y solo trae encabezados', async () => {
        evidences.find.mockResolvedValue([]);

        const { res, file } = await downloadXlsx();

        // Las fechas del período siempre cuentan como filtros.
        expect(dispositionOf(res)).toMatch(
          /filename="Hallazgos_Todas_\+2filtros_\d/,
        );
        expect(evidences.query).not.toHaveBeenCalled();
        const sheet = (await workbookOf(file)).sheet('Hallazgos');
        expect(sheet.cell('A1').value()).toBe('ID');
        expect(sheet.cell('A2').value()).toBeUndefined();
      });

      it('si el cliente se desconecta a media descarga termina sin quedarse esperando', async () => {
        const logged = jest
          .spyOn(Logger.prototype, 'error')
          .mockImplementation(() => undefined);
        const res = Object.assign(
          new Writable({
            write(_chunk, _encoding, callback) {
              callback(new Error('cliente desconectado'));
            },
          }),
          { setHeader: jest.fn() },
        );

        await runAsUser(reporter, () =>
          service.downloadFile('xlsx', PERIOD as never, res as never),
        );

        expect(res.destroyed).toBe(true);
        expect(logged).toHaveBeenCalledWith(
          expect.stringContaining('No se pudo generar el Excel de hallazgos'),
        );
      });
    });

    describe('pdf', () => {
      const ended = async (res: FakeResponse) => {
        for (let i = 0; i < 500 && !res.end.mock.calls.length; i++) {
          await new Promise((resolve) => setTimeout(resolve, 10));
        }
        return res.end.mock.calls[0][0] as Buffer;
      };

      it('responde un PDF adjunto (imagen faltante: imagen por defecto)', async () => {
        const res = await download('pdf');
        const body = await ended(res);

        expect(res.writeHead).toHaveBeenCalledWith(
          200,
          expect.objectContaining({
            'Content-Type': 'application/pdf',
            // Mismo nombre que el Excel: sin planta, "Todas".
            'Content-Disposition': expect.stringMatching(
              /filename="Hallazgos_Todas_\d{4}-\d{2}-\d{2}_\d{4}_UTC[+-]\d{2}.*\.pdf"/,
            ),
          }),
        );
        expect(body.subarray(0, 4).toString()).toBe('%PDF');
      });

      it('se nombra como el Excel: planta, filtros extra y hora local', async () => {
        const query = {
          manufacturingPlantId: 1,
          statuses: 'Abierto',
          startDate: '01/10/2026',
          endDate: '31/10/2026',
          timeZone: 'America/Bogota',
        };
        const pdfRes = await download('pdf', query);
        await ended(pdfRes);
        const pdfName = (
          pdfRes.writeHead.mock.calls[0][1] as Record<string, string>
        )['Content-Disposition'];
        const xlsxName = dispositionOf((await downloadXlsx(query)).res);

        expect(pdfName).toMatch(
          /filename="Hallazgos_Tepotzotl.*_\+3filtros_\d{4}-\d{2}-\d{2}_\d{4}_UTC-05\.pdf"/,
        );
        // Misma lógica: solo cambia la extensión (y, si cambió el minuto, la hora).
        const stem = (name: string) =>
          /filename="(Hallazgos_[^_]+_\+3filtros)_/.exec(name)?.[1];
        expect(stem(pdfName)).toBe(stem(xlsxName));
      });

      it('sin resultados también responde un PDF (antes respondía 500)', async () => {
        evidences.find.mockResolvedValue([]);

        const body = await ended(await download('pdf'));

        expect(body.subarray(0, 4).toString()).toBe('%PDF');
      });
    });
  });

  // Compatibilidad con el UI anterior durante el despliegue: ya no expone
  // las listas, solo el correo propio en las que aplica.
  describe('getPermissionsConfig (obsoleto)', () => {
    const configFor = (email: string) =>
      runAsUser(buildUser({ email }), () => service.getPermissionsConfig());

    it('con permisos especiales solo devuelve el correo propio', async () => {
      await expect(configFor('sst@hadamexico.com')).resolves.toEqual({
        supervisorOverrideEmails: ['sst@hadamexico.com'],
        cancelEvidenceEmails: ['sst@hadamexico.com'],
      });
      await expect(configFor('klarios@hadamexico.com')).resolves.toEqual({
        supervisorOverrideEmails: ['klarios@hadamexico.com'],
        cancelEvidenceEmails: [],
      });
    });

    it('sin permisos especiales devuelve listas vacías (antes, todos los correos)', async () => {
      await expect(configFor('ana@hallazgos.test')).resolves.toEqual({
        supervisorOverrideEmails: [],
        cancelEvidenceEmails: [],
      });
    });
  });
});
