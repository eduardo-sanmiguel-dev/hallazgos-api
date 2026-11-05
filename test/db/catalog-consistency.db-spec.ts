import {
  RulesOfLife,
  StandardOfBehavior,
  AreaOfBehavior,
} from '../../src/rules-of-life/entities/index.js';
import {
  Employee,
  EmployeeArea,
  EmployeePosition,
} from '../../src/employees/entities/index.js';
import { Genre } from '../../src/genres/entities/genre.entity.js';
import { Ics } from '../../src/ics/entities/ics.entity.js';
import { MainType } from '../../src/main-types/entities/main-type.entity.js';
import { createE2eApp, type E2eApp } from './e2e-app.js';

describe('Catálogos activos y relaciones de ICS con PostgreSQL real', () => {
  let app: E2eApp;
  let rule: RulesOfLife, inactiveRule: RulesOfLife, emptyRule: RulesOfLife;
  let standard: StandardOfBehavior,
    inactiveStandard: StandardOfBehavior,
    otherStandard: StandardOfBehavior;
  let area: AreaOfBehavior, inactiveArea: AreaOfBehavior;
  let employee: Employee;
  beforeAll(async () => {
    app = await createE2eApp();
    const db = app.dataSource;
    rule = await db
      .getRepository(RulesOfLife)
      .save({ name: 'Regla activa', order: 1 });
    inactiveRule = await db
      .getRepository(RulesOfLife)
      .save({ name: 'Regla inactiva', order: 2, isActive: false });
    emptyRule = await db
      .getRepository(RulesOfLife)
      .save({ name: 'Regla sin estándares', order: 3 });
    area = await db.getRepository(AreaOfBehavior).save({ name: 'Área activa' });
    inactiveArea = await db
      .getRepository(AreaOfBehavior)
      .save({ name: 'Área inactiva', isActive: false });
    standard = await db.getRepository(StandardOfBehavior).save({
      name: 'Estándar activo',
      rulesOfLife: rule,
      areas: [area, inactiveArea],
    });
    inactiveStandard = await db
      .getRepository(StandardOfBehavior)
      .save({ name: 'Estándar inactivo', rulesOfLife: rule, isActive: false });
    otherStandard = await db
      .getRepository(StandardOfBehavior)
      .save({ name: 'Estándar de otra regla', rulesOfLife: emptyRule });
    const employeeArea = await db
      .getRepository(EmployeeArea)
      .save({ name: 'Área de pruebas' });
    const position = await db
      .getRepository(EmployeePosition)
      .save({ name: 'Puesto de pruebas' });
    const gender = await db
      .getRepository(Genre)
      .save({ name: 'Género de pruebas' });
    employee = await db.getRepository(Employee).save({
      code: 9901,
      name: 'Empleado de prueba',
      area: employeeArea,
      position,
      gender,
      manufacturingPlants: [app.base.plants.tepotzotlan],
    });
  });
  afterAll(async () => {
    await app?.close();
  });
  const create = (fields: Record<string, string> = {}) => {
    const payload = {
      manufacturingPlantId: String(app.base.plants.tepotzotlan.id),
      totalPeople: '5',
      ruleOfLifeId: String(rule.id),
      standardOfBehaviorId: String(standard.id),
      areaOfBehaviorId: String(area.id),
      'employeesIds[0]': String(employee.id),
      ...fields,
    };
    if (payload.standardOfBehaviorId === '')
      delete payload.standardOfBehaviorId;
    return app.call('post', '/ics', app.tokens.admin).field(payload);
  };

  it('filtra cada nivel del catálogo', async () => {
    const response = await app
      .call('get', '/ics/catalogs', app.tokens.admin)
      .expect(200);
    expect(response.body.map((item) => item.id)).not.toContain(inactiveRule.id);
    const current = response.body.find((item) => item.id === rule.id);
    expect(current.standards.map((item) => item.id)).toEqual([standard.id]);
    expect(current.standards[0].areas.map((item) => item.id)).toEqual([
      area.id,
    ]);
  });
  it('acepta el formulario multipart válido', async () => {
    await create().expect(201);
    expect(await app.dataSource.getRepository(Ics).count()).toBe(1);
  });
  it('mantiene consultable un ICS histórico cuando su regla se desactiva', async () => {
    const [record] = await app.dataSource.getRepository(Ics).find({ take: 1 });
    await app.dataSource
      .getRepository(RulesOfLife)
      .update(rule.id, { isActive: false });
    try {
      const response = await app
        .call('get', `/ics/${record.id}`, app.tokens.admin)
        .expect(200);
      expect(response.body.ruleOfLife.isActive).toBe(false);
    } finally {
      await app.dataSource
        .getRepository(RulesOfLife)
        .update(rule.id, { isActive: true });
    }
  });
  it.each(['rule', 'standard', 'otherStandard', 'area', 'areaWithoutStandard'])(
    'rechaza %s inválido sin guardar',
    async (scenario) => {
      const fields: Record<string, string> = {};
      if (scenario === 'rule') fields.ruleOfLifeId = String(inactiveRule.id);
      if (scenario === 'standard')
        fields.standardOfBehaviorId = String(inactiveStandard.id);
      if (scenario === 'otherStandard')
        fields.standardOfBehaviorId = String(otherStandard.id);
      if (scenario === 'area')
        fields.areaOfBehaviorId = String(inactiveArea.id);
      if (scenario === 'areaWithoutStandard') fields.standardOfBehaviorId = '';
      const before = await app.dataSource.getRepository(Ics).count();
      await create(fields).expect(scenario === 'rule' ? 404 : 400);
      expect(await app.dataSource.getRepository(Ics).count()).toBe(before);
    },
  );
  it('excluye los tipos con criterio padre desactivado del listado y del detalle activo', async () => {
    await app.dataSource
      .getRepository(MainType)
      .update(app.base.mainType.id, { isActive: false });
    const response = await app
      .call('get', '/secondary-types', app.tokens.admin)
      .expect(200);
    expect(response.body.map((item) => item.id)).not.toContain(
      app.base.secondaryType.id,
    );
    await app
      .call(
        'get',
        `/secondary-types/${app.base.secondaryType.id}`,
        app.tokens.admin,
      )
      .expect(404);
  });
});
