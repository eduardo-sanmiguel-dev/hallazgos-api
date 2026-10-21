import { BadRequestException, NotFoundException } from '@nestjs/common';
import { FindOperator, In } from 'typeorm';

import {
  buildUser,
  createServiceTestingModule,
  mockProvider,
  RepositoryMock,
  runAsUser,
} from '@test/utils';
import { ManufacturingPlantsService } from 'manufacturing-plants/manufacturing-plants.service';
import { GembaWalkEvaluation } from './entities/gemba-walk-evaluation.entity';
import { GembaWalkEvaluationsService } from './gemba-walk-evaluations.service';

describe('GembaWalkEvaluationsService', () => {
  let service: GembaWalkEvaluationsService;
  let evaluations: RepositoryMock<GembaWalkEvaluation>;
  let plants: jest.Mocked<ManufacturingPlantsService>;
  const user = buildUser({
    id: 10,
    manufacturingPlants: [{ id: 1 }, { id: 2 }] as never,
  });
  const as = <T>(fn: () => Promise<T>) => runAsUser(user, fn);
  const qb = () => evaluations.queryBuilder;

  const stored = (overrides: Partial<GembaWalkEvaluation> = {}) =>
    ({
      id: 4,
      isActive: true,
      area: 'Almacén',
      category: 'SHE',
      description: 'Pasillos libres',
      manufacturingPlant: { id: 1 },
      ...overrides,
    }) as GembaWalkEvaluation;

  beforeEach(async () => {
    const testing = await createServiceTestingModule(
      GembaWalkEvaluationsService,
      {
        repositories: [GembaWalkEvaluation],
        providers: [mockProvider(ManufacturingPlantsService)],
      },
    );
    service = testing.service;
    evaluations = testing.repository(GembaWalkEvaluation);
    plants = testing.get(ManufacturingPlantsService);
    qb().getOne.mockResolvedValue(null);
    evaluations.save.mockImplementation(
      async (e) => ({ id: 4, ...e }) as never,
    );
    evaluations.preload.mockImplementation(async (e) => e as never);
    evaluations.findOne.mockResolvedValue(stored());
  });

  describe('create', () => {
    const dto = {
      manufacturingPlantId: 1,
      area: ' Almacén ',
      category: 'SHE',
      description: ' Pasillos libres ',
    };

    it('guarda el concepto sin espacios sobrantes', async () => {
      await as(() => service.create(dto));

      expect(plants.findOne).toHaveBeenCalledWith(1);
      expect(evaluations.create).toHaveBeenCalledWith(
        expect.objectContaining({
          area: 'Almacén',
          description: 'Pasillos libres',
          category: 'SHE',
          createdBy: { id: 10 },
        }),
      );
    });

    it.each([
      ['área', { area: '  ' }],
      ['descripción', { description: '  ' }],
    ])(
      '%s con solo espacios responde 400 (antes se guardaba vacía)',
      async (_c, override) => {
        await expect(
          as(() => service.create({ ...dto, ...override })),
        ).rejects.toThrow(
          new BadRequestException(
            'El área y la descripción del concepto son obligatorias',
          ),
        );
      },
    );

    it('un concepto activo con la misma área y categoría responde 400', async () => {
      qb().getOne.mockResolvedValue(stored());

      await expect(as(() => service.create(dto))).rejects.toThrow(
        new BadRequestException(
          'Ya existe un concepto activo con esa área y categoría en la planta seleccionada',
        ),
      );
    });
  });

  describe('findAll', () => {
    it('busca el texto en área o descripción', async () => {
      await as(async () =>
        service.findAll({
          search: ' pasillo ',
          category: 'SHE',
          manufacturingPlantId: 1,
        }),
      );

      const { where } = evaluations.find.mock.calls[0][0] as {
        where: Record<string, unknown>[];
      };
      expect(where).toHaveLength(2);
      expect((where[0].area as FindOperator<string>).value).toBe('%pasillo%');
      expect((where[1].description as FindOperator<string>).value).toBe(
        '%pasillo%',
      );
      expect(where[0]).toMatchObject({
        category: 'SHE',
        manufacturingPlant: { isActive: true, id: In([1]) },
      });
    });

    it('sin búsqueda usa un solo filtro y pagina si se pide', async () => {
      evaluations.findAndCount.mockResolvedValue([[stored()], 1]);

      await as(async () => service.findAll({ page: 1, limit: 10 }));

      const { where } = evaluations.findAndCount.mock.calls[0][0] as {
        where: object;
      };
      expect(Array.isArray(where)).toBe(false);
    });
  });

  describe('findOne', () => {
    it('inexistente responde 404', async () => {
      evaluations.findOne.mockResolvedValue(null);

      await expect(as(async () => service.findOne(4))).rejects.toThrow(
        new NotFoundException('Concepto con ID 4 no encontrado'),
      );
    });

    it('inactivo responde 400', async () => {
      evaluations.findOne.mockResolvedValue(stored({ isActive: false }));

      await expect(as(async () => service.findOne(4))).rejects.toThrow(
        new BadRequestException('El concepto con ID 4 esta inactivo'),
      );
    });
  });

  it('update conserva lo no enviado y excluye el propio concepto al validar', async () => {
    await as(() => service.update(4, { description: ' Nueva ' }));

    expect(evaluations.preload).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 4,
        area: 'Almacén',
        category: 'SHE',
        description: 'Nueva',
        manufacturingPlant: { id: 1 },
      }),
    );
    expect(qb().andWhere).toHaveBeenCalledWith('evaluation.id <> :excludeId', {
      excludeId: 4,
    });
  });

  it('remove desactiva el concepto', async () => {
    evaluations.save.mockImplementation(async (e) => e as never);

    await expect(as(() => service.remove(4))).resolves.toMatchObject({
      isActive: false,
      updatedBy: { id: 10 },
    });
  });
});
