import { NotFoundException } from '@nestjs/common';
import { FindOperator } from 'typeorm';

import {
  buildManufacturingPlant,
  buildUser,
  createServiceTestingModule,
  mockProvider,
  RepositoryMock,
  runAsUser,
} from '@test/utils';
import { ManufacturingPlantsService } from 'manufacturing-plants/manufacturing-plants.service';
import { Equipment, EquipmentCostHistory } from './entities';
import { EquipmentsService } from './equipments.service';

const operand = (value: unknown) => (value as FindOperator<unknown>).value;

describe('EquipmentsService', () => {
  let service: EquipmentsService;
  let equipments: RepositoryMock<Equipment>;
  let costHistory: RepositoryMock<EquipmentCostHistory>;
  let plants: jest.Mocked<ManufacturingPlantsService>;
  // "Tabla" de equipos: findOne aplica los filtros como la base.
  let stored: Equipment[];

  const tepotzotlan = buildManufacturingPlant({ id: 1 });
  const manizales = buildManufacturingPlant({ id: 2, name: 'Manizales' });
  const user = buildUser({ id: 10, manufacturingPlants: [tepotzotlan] });
  const as = <T>(fn: () => Promise<T>) => runAsUser(user, fn);

  const buildEquipment = (overrides: Partial<Equipment> = {}) =>
    ({
      id: 5,
      name: 'Casco',
      isActive: true,
      manufacturingPlant: tepotzotlan,
      costHistory: [],
      ...overrides,
    }) as Equipment;

  beforeEach(async () => {
    const testing = await createServiceTestingModule(EquipmentsService, {
      repositories: [Equipment, EquipmentCostHistory],
      providers: [mockProvider(ManufacturingPlantsService)],
    });
    service = testing.service;
    equipments = testing.repository(Equipment);
    costHistory = testing.repository(EquipmentCostHistory);
    plants = testing.get(ManufacturingPlantsService);
    plants.getColombianPlantsIds.mockResolvedValue([2]);

    stored = [buildEquipment()];
    equipments.findOne.mockImplementation(async ({ where }) => {
      const { id, isActive, manufacturingPlant } = where as {
        id: number;
        isActive: boolean;
        manufacturingPlant: { id: unknown };
      };
      const allowed = operand(manufacturingPlant.id) as number[];
      return (
        stored.find(
          (e) =>
            e.id === id &&
            e.isActive === isActive &&
            allowed.includes(e.manufacturingPlant.id),
        ) ?? null
      );
    });
    equipments.save.mockImplementation(async (e) => ({ id: 5, ...e }) as never);
  });

  describe('findOne', () => {
    it('devuelve un equipo de una planta del usuario', async () => {
      await expect(as(() => service.findOne(5))).resolves.toMatchObject({
        id: 5,
      });
    });

    it.each([
      [
        'de otra planta',
        () => (stored = [buildEquipment({ manufacturingPlant: manizales })]),
      ],
      ['inactivo', () => (stored = [buildEquipment({ isActive: false })])],
      ['inexistente', () => (stored = [])],
    ])('un equipo %s responde 404', async (_c, arrange) => {
      arrange();

      await expect(as(() => service.findOne(5))).rejects.toThrow(
        new NotFoundException('Equipo con id 5 no encontrado.'),
      );
    });
  });

  describe('create', () => {
    it('guarda el equipo con quien lo crea y su costo inicial', async () => {
      await as(() =>
        service.create({
          name: 'Casco',
          deliveryFrequency: 30,
          price: 120,
          manufacturingPlantId: 1,
        }),
      );

      expect(equipments.create).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Casco',
          deliveryFrequency: 30,
          manufacturingPlant: { id: 1 },
          createdBy: expect.objectContaining({ id: user.id }),
        }),
      );
      expect(costHistory.save).toHaveBeenCalledWith(
        expect.objectContaining({ price: 120 }),
      );
    });

    it('sin precio no registra historial de costos', async () => {
      await as(() =>
        service.create({ name: 'Guantes', manufacturingPlantId: 1 }),
      );

      expect(costHistory.save).not.toHaveBeenCalled();
    });
  });

  describe('listados (solo plantas del usuario)', () => {
    const plantFilter = () => {
      const [{ where }] = equipments.find.mock.calls[0] as [
        { where: { manufacturingPlant: { id: unknown }; name?: unknown } },
      ];
      return where;
    };

    it('sin planta usa todas las del usuario', async () => {
      await as(() => service.findAll(undefined, ''));

      expect(operand(plantFilter().manufacturingPlant.id)).toEqual([1]);
      expect(plantFilter()).not.toHaveProperty('name');
    });

    it('con planta propia y nombre filtra por ambos', async () => {
      await as(() => service.findAll(1, 'cas'));

      expect(operand(plantFilter().manufacturingPlant.id)).toEqual([1]);
      expect(operand(plantFilter().name)).toBe('%cas%');
    });

    it('con planta ajena no devuelve nada', async () => {
      await as(() => service.findAll(2, ''));

      expect(operand(plantFilter().manufacturingPlant.id)).toEqual([]);
    });

    it('paginado ordena el historial de costos del más reciente al más antiguo', async () => {
      equipments.findAndCount.mockResolvedValue([
        [
          buildEquipment({
            costHistory: [
              { createdAt: new Date('2026-01-01') },
              { createdAt: new Date('2026-03-01') },
            ] as never,
          }),
        ],
        1,
      ]);

      const result = await as(() =>
        service.findAllPaginated(undefined, '', '1', '10'),
      );

      expect(result.count).toBe(1);
      expect(
        result.data[0].costHistory.map(({ createdAt }) => createdAt),
      ).toEqual([new Date('2026-03-01'), new Date('2026-01-01')]);
    });
  });

  describe('update', () => {
    it('actualiza y registra el nuevo precio', async () => {
      await as(() =>
        service.update(5, {
          name: 'Casco nuevo',
          price: 150,
          manufacturingPlantId: 1,
        }),
      );

      expect(equipments.save).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Casco nuevo',
          updatedBy: expect.objectContaining({ id: user.id }),
        }),
      );
      expect(costHistory.save).toHaveBeenCalledWith(
        expect.objectContaining({ price: 150 }),
      );
    });

    it('sin planta en el body calcula la hora con la planta del equipo', async () => {
      await as(() => service.update(5, { name: 'Casco' }));

      expect(plants.getColombianPlantsIds).toHaveBeenCalled();
      expect(costHistory.save).not.toHaveBeenCalled();
      expect(equipments.save.mock.calls[0][0].updatedAt).toBeInstanceOf(Date);
    });

    it('un equipo de otra planta responde 404 sin guardar', async () => {
      stored = [buildEquipment({ manufacturingPlant: manizales })];

      await expect(
        as(() => service.update(5, { name: 'X' })),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(equipments.save).not.toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    it('desactiva el equipo (borrado lógico)', async () => {
      await as(() => service.remove(5));

      expect(equipments.save).toHaveBeenCalledWith(
        expect.objectContaining({
          isActive: false,
          updatedBy: expect.objectContaining({ id: user.id }),
        }),
      );
    });

    it('un equipo de otra planta responde 404 sin guardar', async () => {
      stored = [buildEquipment({ manufacturingPlant: manizales })];

      await expect(as(() => service.remove(5))).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(equipments.save).not.toHaveBeenCalled();
    });
  });
});
