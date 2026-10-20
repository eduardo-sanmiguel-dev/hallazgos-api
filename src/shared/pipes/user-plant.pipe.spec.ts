import {
  BadRequestException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';

import { buildManufacturingPlant, buildUser, runAsUser } from '@test/utils';
import { RequestContextService } from '../services/request-context.service';
import { OptionalUserPlantPipe, UserPlantPipe } from './user-plant.pipe';

describe('UserPlantPipe', () => {
  const pipe = new UserPlantPipe(new RequestContextService());
  const user = buildUser({
    manufacturingPlants: [
      buildManufacturingPlant({ id: 1 }),
      buildManufacturingPlant({ id: 3 }),
    ],
  });
  const transform = (value: unknown) =>
    runAsUser(user, () => pipe.transform(value));

  it.each([
    ['texto', '3'],
    ['número', 3],
  ])('una planta propia (%s) pasa como número', async (_c, value) => {
    await expect(transform(value)).resolves.toBe(3);
  });

  it('una planta ajena responde 404', async () => {
    await expect(transform('2')).rejects.toThrow(
      new NotFoundException('Planta #2 no encontrada'),
    );
  });

  it.each([
    ['sin valor', undefined],
    ['vacía', ''],
    ['no numérica', '1 OR 1=1'],
    ['decimal', '1.5'],
    ['cero', '0'],
    ['negativa', '-1'],
  ])('una planta %s responde 400', async (_c, value) => {
    await expect(transform(value)).rejects.toThrow(
      new BadRequestException('manufacturingPlantId es obligatorio'),
    );
  });

  it('sin sesión responde 401', async () => {
    await expect(
      runAsUser(null, () => pipe.transform('1')),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
});

describe('OptionalUserPlantPipe', () => {
  const pipe = new OptionalUserPlantPipe(new RequestContextService());
  const user = buildUser({
    manufacturingPlants: [buildManufacturingPlant({ id: 1 })],
  });
  const transform = (value: unknown) =>
    runAsUser(user, () => pipe.transform(value));

  it.each([
    ['sin valor', undefined],
    ['vacía', ''],
    ['null', null],
  ])(
    'una planta %s devuelve undefined (todas las del usuario)',
    async (_c, value) => {
      await expect(transform(value)).resolves.toBeUndefined();
    },
  );

  it('una planta propia pasa como número', async () => {
    await expect(transform('1')).resolves.toBe(1);
  });

  it('una planta ajena responde 404', async () => {
    await expect(transform('2')).rejects.toBeInstanceOf(NotFoundException);
  });

  it.each([
    ['no numérica', 'abc'],
    ['cero', '0'],
  ])('una planta %s responde 400', async (_c, value) => {
    await expect(transform(value)).rejects.toBeInstanceOf(BadRequestException);
  });
});
