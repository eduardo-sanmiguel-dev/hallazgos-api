import {
  BadRequestException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';

import * as argon2 from 'argon2';
import { plainToInstance } from 'class-transformer';
import { FindOperator } from 'typeorm';

import { ROLE_ADMINISTRADOR, ROLE_SUPERVISOR } from '@shared/constants';
import {
  buildManufacturingPlant,
  buildUser,
  createServiceTestingModule,
  mockProvider,
  RepositoryMock,
  runAsUser,
} from '@test/utils';
import { ManufacturingPlantsService } from 'manufacturing-plants/manufacturing-plants.service';
import { ProcessesService } from 'processes/processes.service';
import { ZonesService } from 'zones/zones.service';
import { User } from './entities/user.entity';
import { UpdateUserDto } from './dto/update-user.dto';
import { UsersService } from './users.service';

// Cuentas de prueba del equipo que no deben aparecer en los listados.
const TEST_ACCOUNTS = [
  'eduardo-266@hotmail.com',
  'eduardo-supervisor@hotmail.com',
  'eduardo-general@hotmail.com',
];

/** Valor de un operador de TypeORM (In, Not, ILike) para revisar filtros. */
const operand = (value: unknown) => (value as FindOperator<unknown>).value;

/** El filtro excluye exactamente estos correos (Not(In([...]))). */
const expectExcludes = (filter: unknown, emails: string[]) => {
  expect((filter as FindOperator<unknown>).type).toBe('not');
  expect(operand(filter)).toEqual(emails);
};

describe('UsersService', () => {
  let service: UsersService;
  let users: RepositoryMock<User>;
  let plants: jest.Mocked<ManufacturingPlantsService>;
  let zones: jest.Mocked<ZonesService>;
  let processes: jest.Mocked<ProcessesService>;

  const tepotzotlan = buildManufacturingPlant({ id: 1, name: 'Tepotzotlán' });
  const zone = { id: 10, name: 'Almacén' };
  const process = { id: 20, name: 'Producción' };

  beforeEach(async () => {
    const testing = await createServiceTestingModule(UsersService, {
      repositories: [User],
      providers: [
        mockProvider(ManufacturingPlantsService),
        mockProvider(ZonesService),
        mockProvider(ProcessesService),
      ],
    });
    service = testing.service;
    users = testing.repository(User);
    plants = testing.get(ManufacturingPlantsService);
    zones = testing.get(ZonesService);
    processes = testing.get(ProcessesService);

    plants.findAllByNames.mockResolvedValue([tepotzotlan]);
    zones.findAllByManufacturingPlantNames.mockResolvedValue([zone] as never);
    processes.findAllByManufacturingPlantNames.mockResolvedValue([
      process,
    ] as never);
  });

  describe('create', () => {
    // Como TypeORM: `create` arma la entidad y `save` corre @BeforeInsert.
    const emulateInsert = () => {
      users.create.mockImplementation((data) =>
        Object.assign(new User(), data),
      );
      users.save.mockImplementation(async (entity: User) => {
        await entity.hashPassword();
        return Object.assign(entity, { id: 55 });
      });
    };

    const dto = {
      name: 'Nueva Persona',
      email: 'nueva@hallazgos.test',
      password: 'Clave-inicial-1',
      rule: ROLE_SUPERVISOR,
      manufacturingPlantNames: ['Tepotzotlán'],
      zoneNames: ['Tepotzotlán - Almacén'],
      processNames: ['Tepotzotlán - Producción'],
    };

    beforeEach(() => {
      emulateInsert();
      users.findOne.mockResolvedValue(buildUser({ id: 55 }));
    });

    it('guarda el usuario con rol, plantas, zonas y procesos resueltos por nombre', async () => {
      await service.create(dto);

      expect(plants.findAllByNames).toHaveBeenCalledWith(['Tepotzotlán']);
      expect(zones.findAllByManufacturingPlantNames).toHaveBeenCalledWith([
        'Tepotzotlán - Almacén',
      ]);
      const saved = users.save.mock.calls[0][0] as User;
      expect(saved).toMatchObject({
        name: 'Nueva Persona',
        email: 'nueva@hallazgos.test',
        role: ROLE_SUPERVISOR,
        manufacturingPlants: [tepotzotlan],
        zones: [zone],
        processes: [process],
      });
    });

    it('guarda la contraseña hasheada, nunca en texto plano', async () => {
      await service.create(dto);

      const saved = users.save.mock.calls[0][0] as User;
      expect(saved.password).not.toBe('Clave-inicial-1');
      await expect(
        argon2.verify(saved.password, 'Clave-inicial-1'),
      ).resolves.toBe(true);
    });

    it('devuelve el usuario recién creado con sus relaciones', async () => {
      const reloaded = buildUser({ id: 55, name: 'Nueva Persona' });
      users.findOne.mockResolvedValue(reloaded);

      await expect(service.create(dto)).resolves.toBe(reloaded);
      expect(users.findOne).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ id: 55, isActive: true }),
        }),
      );
    });

    it('sin zonas ni procesos no asigna ninguno', async () => {
      zones.findAllByManufacturingPlantNames.mockResolvedValue([]);
      processes.findAllByManufacturingPlantNames.mockResolvedValue([]);

      await service.create({ ...dto, zoneNames: [], processNames: [] });

      const saved = users.save.mock.calls[0][0] as User;
      expect(saved.zones).toBeUndefined();
      expect(saved.processes).toBeUndefined();
    });

    // (La contraseña obligatoria al crear se valida en CreateUserDto:
    // ver dto/user-dtos.spec.ts.)

    it('debe lanzar BadRequestException si alguna planta no existe o está inactiva', async () => {
      plants.findAllByNames.mockResolvedValue([tepotzotlan]);

      await expect(
        service.create({
          ...dto,
          manufacturingPlantNames: ['Tepotzotlán', 'Planta fantasma'],
        }),
      ).rejects.toThrow(
        new BadRequestException(
          'Plantas no encontradas o inactivas: Planta fantasma',
        ),
      );
      expect(users.save).not.toHaveBeenCalled();
    });

    it('debe lanzar BadRequestException si no se asigna ninguna planta', async () => {
      await expect(
        service.create({ ...dto, manufacturingPlantNames: [] }),
      ).rejects.toThrow(
        new BadRequestException('Debe asignar al menos una planta'),
      );
      expect(plants.findAllByNames).not.toHaveBeenCalled();
      expect(users.save).not.toHaveBeenCalled();
    });

    it('acepta nombres de planta repetidos (cuenta cada planta una vez)', async () => {
      await service.create({
        ...dto,
        manufacturingPlantNames: ['Tepotzotlán', 'Tepotzotlán'],
      });

      expect(plants.findAllByNames).toHaveBeenCalledWith(['Tepotzotlán']);
      expect(users.save).toHaveBeenCalled();
    });
  });

  describe('findAll', () => {
    const lastFindArgs = () => users.find.mock.calls.at(-1)[0];

    it('lista solo usuarios activos, del más reciente al más antiguo', async () => {
      await service.findAll({} as never);

      const { where, order } = lastFindArgs();
      expect(where).toEqual([{ isActive: true }]);
      expect(order).toMatchObject({
        id: 'DESC',
        manufacturingPlants: { name: 'ASC' },
        zones: { name: 'ASC' },
      });
    });

    it('aplica los filtros de nombre, planta, rol y proceso', async () => {
      await service.findAll({
        name: 'ana',
        manufacturingPlantId: 1,
        rule: ROLE_ADMINISTRADOR,
        processId: 20,
      } as never);

      const [where] = lastFindArgs().where as Record<string, unknown>[];
      expect(operand(where.name)).toBe('%ana%');
      expect(
        operand((where.manufacturingPlants as { id: unknown }).id),
      ).toEqual([1]);
      expect(where.role).toBe(ROLE_ADMINISTRADOR);
      expect(operand((where.processes as { id: unknown }).id)).toEqual([20]);
    });

    it('filtrar por zona devuelve solo supervisores de esa zona', async () => {
      await service.findAll({
        zoneId: 10,
        rule: ROLE_ADMINISTRADOR,
      } as never);

      const [where] = lastFindArgs().where as Record<string, unknown>[];
      expect(operand((where.zones as { id: unknown }).id)).toEqual([10]);
      expect(where.role).toBe(ROLE_SUPERVISOR);
    });

    it('la búsqueda libre coincide por nombre o por correo', async () => {
      await service.findAll({ search: '  perez ' } as never);

      const where = lastFindArgs().where as Record<string, unknown>[];
      expect(where).toHaveLength(2);
      expect(operand(where[0].name)).toBe('%perez%');
      expect(operand(where[1].email)).toBe('%perez%');
    });

    it('ordena por la columna pedida en orderBy (campo|dirección)', async () => {
      await service.findAll({ orderBy: 'name|asc' } as never);

      expect(lastFindArgs().order).toMatchObject({ name: 'ASC' });
      expect(lastFindArgs().order).not.toHaveProperty('id');
    });

    // El 400 por formato inválido lo da QueryUserDto (dto/user-dtos.spec.ts);
    // el servicio, además, nunca arma el orden con un valor fuera de la lista.
    it.each(['name', 'password|asc', 'name|asc; DROP TABLE "user"'])(
      'ignora un orderBy fuera del formato permitido (%s) y usa el orden por defecto',
      async (orderBy) => {
        await service.findAll({ orderBy } as never);

        expect(lastFindArgs().order).toMatchObject({ id: 'DESC' });
        expect(lastFindArgs().order).not.toHaveProperty('password');
        expect(lastFindArgs().order).not.toHaveProperty('name');
      },
    );

    describe('paginado', () => {
      it('pide solo la página solicitada y devuelve el total', async () => {
        users.findAndCount.mockResolvedValue([[buildUser()], 31]);

        const result = await service.findAll({ page: 3, limit: 10 } as never);

        expect(users.findAndCount).toHaveBeenCalledWith(
          expect.objectContaining({
            take: 10,
            skip: 20,
            order: { id: 'DESC' },
          }),
        );
        expect(result).toMatchObject({ count: 31 });
        expect(users.find).not.toHaveBeenCalled();
      });

      it('con limit -1 devuelve todos los registros', async () => {
        await service.findAll({ page: 1, limit: -1 } as never);

        const args = users.findAndCount.mock.calls[0][0];
        expect(args).not.toHaveProperty('take');
        expect(args).not.toHaveProperty('skip');
      });

      it('ordena las plantas y zonas de cada usuario por nombre', async () => {
        const user = buildUser({
          manufacturingPlants: [
            buildManufacturingPlant({ name: 'Tepotzotlán' }),
            buildManufacturingPlant({ name: 'Manizales' }),
          ],
          zones: [{ name: 'Z2' }, { name: 'Almacén' }] as never,
        });
        users.findAndCount.mockResolvedValue([[user], 1]);

        const { data } = (await service.findAll({
          page: 1,
          limit: 10,
        } as never)) as { data: User[] };

        expect(data[0].manufacturingPlants.map((p) => p.name)).toEqual([
          'Manizales',
          'Tepotzotlán',
        ]);
        expect(data[0].zones.map((z) => z.name)).toEqual(['Almacén', 'Z2']);
      });
    });
  });

  describe('findAllByPlant', () => {
    it('en la planta 3 solo devuelve la lista fija de correos autorizados', async () => {
      await service.findAllByPlant(3);

      const { where } = users.find.mock.calls[0][0] as {
        where: Record<string, unknown>;
      };
      expect(operand(where.email)).toEqual([
        'strujillo@hadamexico.com',
        'Dspaggiari@hadamexico.com',
        'Aholguin@hada.com.co',
        'Cvelasquez@hada.com.co',
        'sst@hadamexico.com',
        'Btorres@hadainternational.com',
      ]);
    });

    it('en otras plantas devuelve los activos de la planta sin las cuentas de prueba', async () => {
      await service.findAllByPlant(1);

      const { where } = users.find.mock.calls[0][0] as {
        where: Record<string, unknown>;
      };
      expect(where).toMatchObject({
        isActive: true,
        manufacturingPlants: { id: 1 },
      });
      expectExcludes(where.email, TEST_ACCOUNTS);
    });
  });

  describe('findOne', () => {
    it('devuelve el usuario activo con sus relaciones', async () => {
      const user = buildUser({ id: 9 });
      users.findOne.mockResolvedValue(user);

      await expect(service.findOne(9)).resolves.toBe(user);
    });

    it('debe lanzar NotFoundException si no existe, está inactivo o no tiene plantas activas', async () => {
      users.findOne.mockResolvedValue(null);

      await expect(service.findOne(9)).rejects.toThrow(
        new NotFoundException('Usuario con id 9 no encontrado'),
      );
    });
  });

  describe.each([
    ['findSupervisor', 'zones', { zoneId: 10 }],
    ['findProcesses', 'processes', { processId: 20 }],
  ] as const)('%s', (method, relation, filter) => {
    const call = (supervisorId = 0) =>
      service[method]({
        manufacturingPlantId: 1,
        supervisorId,
        zoneId: 0,
        processId: 0,
        ...filter,
      });

    it(`devuelve supervisores activos de la planta y ${relation}, sin cuentas de prueba`, async () => {
      await call();

      const { where } = users.find.mock.calls[0][0] as {
        where: Record<string, unknown>;
      };
      expect(where).toMatchObject({
        isActive: true,
        role: ROLE_SUPERVISOR,
        manufacturingPlants: { id: 1 },
        [relation]: { id: Object.values(filter)[0] },
      });
      expect(where).not.toHaveProperty('id');
      expectExcludes(where.email, TEST_ACCOUNTS);
    });

    it('con supervisorId devuelve solo ese supervisor', async () => {
      await call(77);

      const { where } = users.find.mock.calls[0][0] as {
        where: Record<string, unknown>;
      };
      expect(where).toMatchObject({ id: 77, role: ROLE_SUPERVISOR });
    });
  });

  describe('getSupervisors', () => {
    it('devuelve los supervisores de las plantas del usuario en sesión', async () => {
      const me = buildUser({
        manufacturingPlants: [
          buildManufacturingPlant({ id: 1 }),
          buildManufacturingPlant({ id: 2 }),
        ],
      });

      await runAsUser(me, () => service.getSupervisors());

      const { where, order } = users.find.mock.calls[0][0] as {
        where: Record<string, unknown>;
        order: unknown;
      };
      expect(where).toMatchObject({ isActive: true, role: ROLE_SUPERVISOR });
      expect(
        operand((where.manufacturingPlants as { id: unknown }).id),
      ).toEqual([1, 2]);
      expect(order).toEqual({ name: 'ASC' });
    });

    it('sin sesión responde 401', async () => {
      await expect(
        runAsUser(null, () => service.getSupervisors()),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });
  });

  describe('getInformationCurrentUser', () => {
    it('devuelve los datos del usuario en sesión', async () => {
      const me = buildUser({ id: 12 });
      users.findOne.mockResolvedValue(me);

      await expect(
        runAsUser(me, () => service.getInformationCurrentUser()),
      ).resolves.toBe(me);
      expect(users.findOne).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ id: 12, isActive: true }),
        }),
      );
    });

    it('debe lanzar NotFoundException si el usuario en sesión ya no está activo', async () => {
      users.findOne.mockResolvedValue(null);

      await expect(
        runAsUser(buildUser({ id: 12 }), () =>
          service.getInformationCurrentUser(),
        ),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('sin sesión responde 401', async () => {
      await expect(
        runAsUser(null, () => service.getInformationCurrentUser()),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });
  });

  describe('update', () => {
    const existing = () =>
      buildUser({
        id: 30,
        name: 'Antes',
        email: 'antes@hallazgos.test',
        role: ROLE_SUPERVISOR,
        zones: [{ id: 1 }] as never,
        processes: [{ id: 2 }] as never,
      });
    const savedUser = () => users.save.mock.calls[0][0] as User;

    beforeEach(() => {
      users.findOne.mockResolvedValue(existing());
    });

    it('actualiza datos, rol y plantas', async () => {
      await service.update(30, {
        name: 'Después',
        email: 'despues@hallazgos.test',
        rule: ROLE_ADMINISTRADOR,
        manufacturingPlantNames: ['Tepotzotlán'],
      });

      expect(savedUser()).toMatchObject({
        id: 30,
        name: 'Después',
        email: 'despues@hallazgos.test',
        role: ROLE_ADMINISTRADOR,
        manufacturingPlants: [tepotzotlan],
      });
    });

    it('un supervisor conserva las zonas y procesos indicados', async () => {
      await service.update(30, {
        rule: ROLE_SUPERVISOR,
        manufacturingPlantNames: ['Tepotzotlán'],
        zoneNames: ['Tepotzotlán - Almacén'],
        processNames: ['Tepotzotlán - Producción'],
      });

      expect(savedUser()).toMatchObject({
        zones: [zone],
        processes: [process],
      });
    });

    it('si deja de ser supervisor se le quitan zonas y procesos', async () => {
      await service.update(30, {
        rule: ROLE_ADMINISTRADOR,
        manufacturingPlantNames: ['Tepotzotlán'],
        zoneNames: ['Tepotzotlán - Almacén'],
      });

      expect(savedUser()).toMatchObject({ zones: [], processes: [] });
      expect(zones.findAllByManufacturingPlantNames).not.toHaveBeenCalled();
    });

    it('con contraseña nueva la guarda hasheada', async () => {
      await service.update(30, {
        rule: ROLE_ADMINISTRADOR,
        manufacturingPlantNames: ['Tepotzotlán'],
        password: 'Nueva-clave-5',
      });

      const { password } = savedUser();
      expect(password).not.toBe('Nueva-clave-5');
      await expect(argon2.verify(password, 'Nueva-clave-5')).resolves.toBe(
        true,
      );
    });

    it('sin contraseña no toca la contraseña actual', async () => {
      await service.update(30, {
        rule: ROLE_ADMINISTRADOR,
        manufacturingPlantNames: ['Tepotzotlán'],
        password: '',
      });

      expect(savedUser()).not.toHaveProperty('password');
    });

    it('editar desde el formulario sin contraseña conserva la actual', async () => {
      const current = await argon2.hash('Clave-actual-1');
      users.findOne.mockResolvedValue(
        buildUser({ id: 30, password: current } as never),
      );

      await service.update(
        30,
        plainToInstance(UpdateUserDto, {
          rule: ROLE_ADMINISTRADOR,
          manufacturingPlantNames: ['Tepotzotlán'],
          password: '',
        }),
      );

      expect(savedUser().password).toBe(current);
    });

    it('debe lanzar NotFoundException y no guardar si el usuario no existe', async () => {
      users.findOne.mockResolvedValue(null);

      await expect(
        service.update(30, {
          rule: ROLE_ADMINISTRADOR,
          manufacturingPlantNames: ['Tepotzotlán'],
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(users.save).not.toHaveBeenCalled();
    });

    it('debe lanzar BadRequestException y no guardar si alguna planta no existe', async () => {
      plants.findAllByNames.mockResolvedValue([]);

      await expect(
        service.update(30, {
          rule: ROLE_ADMINISTRADOR,
          manufacturingPlantNames: ['Planta fantasma'],
        }),
      ).rejects.toThrow(
        new BadRequestException(
          'Plantas no encontradas o inactivas: Planta fantasma',
        ),
      );
      expect(users.save).not.toHaveBeenCalled();
    });

    it('debe lanzar BadRequestException y no guardar si se quitan todas las plantas', async () => {
      await expect(
        service.update(30, {
          rule: ROLE_ADMINISTRADOR,
          manufacturingPlantNames: [],
        }),
      ).rejects.toThrow(
        new BadRequestException('Debe asignar al menos una planta'),
      );
      expect(users.save).not.toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    it('desactiva al usuario (no lo borra)', async () => {
      users.findOne.mockResolvedValue(buildUser({ id: 30 }));

      await service.remove(30);

      expect(users.save).toHaveBeenCalledWith({ id: 30, isActive: false });
      expect(users.delete).not.toHaveBeenCalled();
    });

    it('debe lanzar NotFoundException y no desactivar si el usuario no existe', async () => {
      users.findOne.mockResolvedValue(null);

      await expect(service.remove(30)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(users.save).not.toHaveBeenCalled();
    });
  });
});
