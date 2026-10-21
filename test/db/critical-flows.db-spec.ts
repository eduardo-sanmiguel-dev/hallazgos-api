import { Logger } from '@nestjs/common';
/** Regresiones críticas: solo PostgreSQL desechable configurado por jest-db. */
import * as argon2 from 'argon2';
import { JwtService } from 'auth/jwt.service';
import { User } from 'users/entities/user.entity';
import { Employee, EmployeeArea, EmployeePosition } from 'employees/entities';
import { Equipment } from 'equipments/entities';
import { Genre } from 'genres/entities/genre.entity';
import { Epp, EppEquipment } from 'epps/entities';
import { Evidence } from 'evidences/entities/evidence.entity';
import { createE2eApp, E2eApp } from './e2e-app';
import { saveEvidence, STATUSES } from './fixtures';

const SIGNATURE =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

describe('Flujos críticos con PostgreSQL', () => {
  let e2e: E2eApp;
  let employee: Employee;
  let equipment: Equipment;
  beforeAll(async () => {
    e2e = await createE2eApp();
    const area = await e2e.dataSource
      .getRepository(EmployeeArea)
      .save({ name: 'Pruebas' });
    const position = await e2e.dataSource
      .getRepository(EmployeePosition)
      .save({ name: 'Operador' });
    const gender = await e2e.dataSource
      .getRepository(Genre)
      .save({ name: 'Pruebas' });
    employee = await e2e.dataSource.getRepository(Employee).save({
      code: 9900,
      name: 'Empleado crítico',
      area,
      position,
      gender,
      manufacturingPlants: [e2e.base.plants.tepotzotlan],
    });
    equipment = await e2e.dataSource.getRepository(Equipment).save({
      name: 'Casco crítico',
      deliveryFrequency: 30,
      manufacturingPlant: e2e.base.plants.tepotzotlan,
      createdBy: e2e.base.users.admin,
    });
  });
  afterAll(() => e2e?.close());

  it.each(['general', 'supervisor'] as const)(
    'el rol %s no puede crear usuarios, escalar privilegios ni desactivar cuentas',
    async (role) => {
      const target = e2e.base.users.generalColombia;
      await e2e
        .call('post', '/users', e2e.tokens[role])
        .send({
          name: 'No autorizado',
          email: 'denied@hallazgos.test',
          password: 'Clave-1',
          rule: 'Administrador',
          manufacturingPlantNames: ['Tepotzotlán'],
        })
        .expect(403);
      await e2e
        .call('patch', '/users/' + target.id, e2e.tokens[role])
        .send({
          rule: 'Administrador',
          password: 'Cambio-ajeno-1',
          manufacturingPlantNames: ['Manizales'],
        })
        .expect(403);
      await e2e
        .call('delete', '/users/' + target.id, e2e.tokens[role])
        .expect(403);
      const stored = await e2e.dataSource
        .getRepository(User)
        .findOneByOrFail({ id: target.id });
      expect(stored).toMatchObject({ role: 'General', isActive: true });
      expect(
        await e2e.dataSource
          .getRepository(User)
          .existsBy({ email: 'denied@hallazgos.test' }),
      ).toBe(false);
    },
  );

  it('las consultas de usuarios solo muestran plantas compartidas', async () => {
    const other = e2e.base.users.generalColombia;
    await e2e.call('get', '/users/' + other.id, e2e.tokens.general).expect(404);
    const response = await e2e
      .call('get', '/users?manufacturingPlantId=2', e2e.tokens.general)
      .expect(200);
    expect(response.body).toEqual([]);
  });

  it('un administrador limitado no asigna ni modifica usuarios de plantas ajenas', async () => {
    const admin = await e2e.dataSource.getRepository(User).save({
      name: 'Admin limitado',
      email: 'scoped-admin@hallazgos.test',
      password: 'Clave-1',
      role: 'Administrador',
      manufacturingPlants: [e2e.base.plants.tepotzotlan],
    });
    const token = e2e.app.get(JwtService).create(admin.id);
    await e2e
      .call('patch', '/users/' + e2e.base.users.generalColombia.id, token)
      .send({ name: 'Ajeno', manufacturingPlantNames: ['Manizales'] })
      .expect(404);
    await e2e
      .call('delete', '/users/' + e2e.base.users.generalColombia.id, token)
      .expect(404);
    await e2e
      .call('post', '/users', token)
      .send({
        name: 'Ajeno',
        email: 'plant-denied@hallazgos.test',
        password: 'Clave-1',
        rule: 'General',
        manufacturingPlantNames: ['Manizales'],
      })
      .expect(404);
    expect(
      await e2e.dataSource
        .getRepository(User)
        .existsBy({ email: 'plant-denied@hallazgos.test' }),
    ).toBe(false);
  });

  it('no permite leer, editar ni desactivar empleados de plantas ajenas', async () => {
    await e2e
      .call('get', '/employees/' + employee.id, e2e.tokens.generalColombia)
      .expect(404);
    await e2e
      .call('patch', '/employees/' + employee.id, e2e.tokens.generalColombia)
      .send({ name: 'Ajeno' })
      .expect(404);
    await e2e
      .call('delete', '/employees/' + employee.id, e2e.tokens.generalColombia)
      .expect(404);
    expect(
      await e2e.dataSource
        .getRepository(Employee)
        .findOneByOrFail({ id: employee.id }),
    ).toMatchObject({ name: 'Empleado crítico', isActive: true });
  });

  it('dos restablecimientos simultáneos con un token solo cambian una vez la contraseña', async () => {
    const user = await e2e.dataSource.getRepository(User).findOne({
      where: { id: e2e.base.users.general.id },
      select: { id: true, email: true, password: true },
    });
    const token = e2e.app
      .get(JwtService)
      .createResetToken(user.id, user.password);
    const passwords = ['Clave-Concurrente-1', 'Clave-Concurrente-2'];
    const results = await Promise.all(
      passwords.map((password) =>
        e2e
          .call('post', '/auth/login-restore-password')
          .send({ email: user.email, token, password }),
      ),
    );
    expect(results.map((response) => response.status).sort()).toEqual([
      201, 401,
    ]);
    const winner = results.findIndex((response) => response.status === 201);
    const stored = await e2e.dataSource
      .getRepository(User)
      .findOne({ where: { id: user.id }, select: { password: true } });
    expect(await argon2.verify(stored.password, passwords[winner])).toBe(true);
    await e2e
      .call('post', '/auth/login-restore-password')
      .send({ email: user.email, token, password: 'Reutilizada-1' })
      .expect(401);
    await e2e.call('get', '/users/supervisors', token).expect(401);
  });

  const deliver = (
    quantity = 1,
    items?: { id: number; quantity: number; observations: string }[],
  ) =>
    e2e.call('post', '/epps', e2e.tokens.general).send({
      employeeId: employee.id,
      signature: SIGNATURE,
      equipments: items ?? [
        { id: equipment.id, quantity, observations: 'Prueba' },
      ],
    });

  it('un fallo en el segundo renglón revierte cabecera y primer renglón de EPP', async () => {
    const epps = e2e.dataSource.getRepository(Epp),
      history = e2e.dataSource.getRepository(EppEquipment);
    const before = [await epps.count(), await history.count()];
    const other = await e2e.dataSource.getRepository(Equipment).save({
      name: 'Guantes rollback',
      manufacturingPlant: e2e.base.plants.tepotzotlan,
      createdBy: e2e.base.users.admin,
    });
    await e2e.dataSource.query(
      "CREATE FUNCTION fail_test_epp_item() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.quantity = 99 THEN RAISE EXCEPTION 'Fallo simulado de renglón'; END IF; RETURN NEW; END $$",
    );
    await e2e.dataSource.query(
      'CREATE TRIGGER fail_test_epp_item BEFORE INSERT ON epp_equipment FOR EACH ROW EXECUTE FUNCTION fail_test_epp_item()',
    );
    const logError = jest.spyOn(Logger.prototype, 'error').mockImplementation();
    try {
      await deliver(1, [
        { id: equipment.id, quantity: 1, observations: 'Primero' },
        { id: other.id, quantity: 99, observations: 'Falla' },
      ]).expect(500);
      expect([await epps.count(), await history.count()]).toEqual(before);
    } finally {
      logError.mockRestore();
      await e2e.dataSource.query(
        'DROP TRIGGER fail_test_epp_item ON epp_equipment',
      );
      await e2e.dataSource.query('DROP FUNCTION fail_test_epp_item()');
    }
  });

  it('dos entregas simultáneas conservan ambas firmas y detectan la segunda fuera de frecuencia', async () => {
    const results = await Promise.all([deliver(), deliver()]);
    expect(results.map((response) => response.status)).toEqual([201, 201]);
    const history = await e2e.dataSource
      .getRepository(EppEquipment)
      .find({ where: { equipment: { id: equipment.id } }, relations: ['epp'] });
    expect(history).toHaveLength(2);
    expect(history.map((row) => row.outOfRangeDelivery).sort()).toEqual([
      false,
      true,
    ]);
    expect(
      history.every(
        (row) => row.epp.signature === SIGNATURE && row.quantity === 1,
      ),
    ).toBe(true);
  });

  it('el historial desactivado no impide una nueva entrega', async () => {
    await e2e.dataSource
      .getRepository(EppEquipment)
      .createQueryBuilder()
      .update()
      .set({ isActive: false })
      .where('"equipmentId" = :id', { id: equipment.id })
      .execute();
    const response = await e2e
      .call(
        'get',
        `/epps/validate-delivery-frequency?equipmentId=${equipment.id}&employeeId=${employee.id}`,
        e2e.tokens.general,
      )
      .expect(200);
    expect(response.body.canDeliver).toBe(true);
    await deliver().expect(201);
    const active = await e2e.dataSource
      .getRepository(EppEquipment)
      .find({ where: { equipment: { id: equipment.id }, isActive: true } });
    expect(active).toHaveLength(1);
    expect(active[0].outOfRangeDelivery).toBe(false);
  });

  it('aunque el administrador tenga ambas plantas, empleado y equipo deben compartir planta', async () => {
    const other = await e2e.dataSource.getRepository(Equipment).save({
      name: 'Equipo Colombia',
      manufacturingPlant: e2e.base.plants.manizales,
      createdBy: e2e.base.users.admin,
    });
    const before = await e2e.dataSource.getRepository(Epp).count();
    await e2e
      .call('post', '/epps', e2e.tokens.admin)
      .send({
        employeeId: employee.id,
        signature: SIGNATURE,
        equipments: [{ id: other.id, quantity: 1, observations: '' }],
      })
      .expect(404);
    expect(await e2e.dataSource.getRepository(Epp).count()).toBe(before);
  });

  it('dos cierres concurrentes solo permiten una transición y una notificación por destinatario', async () => {
    const evidence = await saveEvidence(e2e.dataSource, e2e.base);
    e2e.mail.sendSolution.mockClear();
    const results = await Promise.all(
      [1, 2].map((i) =>
        e2e
          .call(
            'post',
            '/evidences/solution/' + evidence.id,
            e2e.tokens.supervisor,
          )
          .field({ descriptionSolution: 'Solución ' + i }),
      ),
    );
    expect(results.map((response) => response.status).sort()).toEqual([
      201, 409,
    ]);
    expect(
      (
        await e2e.dataSource
          .getRepository(Evidence)
          .findOneByOrFail({ id: evidence.id })
      ).status,
    ).toBe(STATUSES.closed);
    const recipients = e2e.mail.sendSolution.mock.calls.map(
      ([payload]) => payload.user.id,
    );
    expect(new Set(recipients).size).toBe(recipients.length);
  });

  it('cerrar y cancelar simultáneamente no sobrescriben un estado final', async () => {
    const evidence = await saveEvidence(e2e.dataSource, e2e.base);
    const [close, cancel] = await Promise.all([
      e2e
        .call(
          'post',
          '/evidences/solution/' + evidence.id,
          e2e.tokens.supervisor,
        )
        .field({ descriptionSolution: 'Concurrente' }),
      e2e.call('delete', '/evidences/' + evidence.id, e2e.tokens.admin),
    ]);
    expect(
      [close.status, cancel.status].filter((status) => status === 409),
    ).toHaveLength(1);
    const stored = await e2e.dataSource
      .getRepository(Evidence)
      .findOneByOrFail({ id: evidence.id });
    expect(stored.status).toBe(
      close.status === 201 ? STATUSES.closed : STATUSES.cancelled,
    );
    expect(stored.isActive).toBe(close.status === 201);
  });

  it('reasignar y cerrar a la vez nunca reabre el hallazgo', async () => {
    const evidence = await saveEvidence(e2e.dataSource, e2e.base);
    const [close, reassign] = await Promise.all([
      e2e
        .call(
          'post',
          '/evidences/solution/' + evidence.id,
          e2e.tokens.supervisor,
        )
        .field({ descriptionSolution: 'Final' }),
      e2e
        .call(
          'patch',
          '/evidences/reassign/' + evidence.id,
          e2e.tokens.supervisor,
        )
        .send({ responsibleIds: [e2e.base.users.admin.id] }),
    ]);
    expect(close.status).toBe(201);
    expect([200, 409]).toContain(reassign.status);
    expect(
      (
        await e2e.dataSource
          .getRepository(Evidence)
          .findOneByOrFail({ id: evidence.id })
      ).status,
    ).toBe(STATUSES.closed);
  });
  it('un empleado compartido no permite consultar ni borrar EPP de otra planta', async () => {
    await e2e.dataSource
      .createQueryBuilder()
      .relation(Employee, 'manufacturingPlants')
      .of(employee.id)
      .add(e2e.base.plants.manizales.id);
    const other = await e2e.dataSource.getRepository(Equipment).save({
      name: 'EPP compartido Colombia',
      manufacturingPlant: e2e.base.plants.manizales,
      createdBy: e2e.base.users.admin,
    });
    await e2e
      .call('post', '/epps', e2e.tokens.admin)
      .send({
        employeeId: employee.id,
        signature: SIGNATURE,
        equipments: [{ id: other.id, quantity: 1, observations: 'Colombia' }],
      })
      .expect(201);
    const history = await e2e.dataSource
      .getRepository(EppEquipment)
      .findOne({ where: { equipment: { id: other.id } }, relations: ['epp'] });
    await e2e
      .call('get', '/epps/' + history.epp.id, e2e.tokens.general)
      .expect(404);
    await e2e
      .call('delete', '/epps/history/' + history.id, e2e.tokens.general)
      .expect(404);
    const response = await e2e
      .call(
        'get',
        '/epps?manufacturingPlantId=1&page=1&limit=100',
        e2e.tokens.general,
      )
      .expect(200);
    const ids = response.body.data.flatMap((row) =>
      row.epps.flatMap((epp) =>
        epp.equipments.map((item) => item.equipment.id),
      ),
    );
    expect(ids).not.toContain(other.id);
    expect(
      await e2e.dataSource
        .getRepository(EppEquipment)
        .existsBy({ id: history.id }),
    ).toBe(true);
  });

  it('un fallo al borrar la cabecera de EPP revierte el borrado de su historial', async () => {
    const history = await e2e.dataSource.getRepository(EppEquipment).findOne({
      where: { equipment: { id: equipment.id } },
      relations: ['epp'],
    });
    const eppId = history.epp.id;
    const before = await e2e.dataSource
      .getRepository(EppEquipment)
      .count({ where: { epp: { id: eppId } } });
    await e2e.dataSource.query(
      "CREATE FUNCTION fail_test_epp_delete() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Fallo simulado al borrar cabecera'; END $$",
    );
    await e2e.dataSource.query(
      'CREATE TRIGGER fail_test_epp_delete BEFORE DELETE ON epp FOR EACH ROW EXECUTE FUNCTION fail_test_epp_delete()',
    );
    const logError = jest.spyOn(Logger.prototype, 'error').mockImplementation();
    try {
      await e2e
        .call('delete', '/epps/history/' + history.id, e2e.tokens.general)
        .expect(500);
      expect(
        await e2e.dataSource.getRepository(Epp).existsBy({ id: eppId }),
      ).toBe(true);
      expect(
        await e2e.dataSource
          .getRepository(EppEquipment)
          .count({ where: { epp: { id: eppId } } }),
      ).toBe(before);
    } finally {
      logError.mockRestore();
      await e2e.dataSource.query('DROP TRIGGER fail_test_epp_delete ON epp');
      await e2e.dataSource.query('DROP FUNCTION fail_test_epp_delete()');
    }
  });
});
