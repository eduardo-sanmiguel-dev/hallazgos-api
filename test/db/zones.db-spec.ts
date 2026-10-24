/**
 * E2E (app completa + base de pruebas): catálogo de zonas para selectores
 * (GET /zones?view=options).
 */
import { createE2eApp, type E2eApp } from './e2e-app.js';

describe('E2E: zonas para selectores (view=options)', () => {
  let e2e: E2eApp;

  beforeAll(async () => {
    e2e = await createE2eApp();
  });

  afterAll(() => e2e?.close());

  it('solo id y nombre, con id y nombre de su planta y área', async () => {
    const { zone, zoneColombia, area, plants } = e2e.base;
    const res = await e2e
      .call('get', '/zones?view=options', e2e.tokens.admin)
      .expect(200);

    expect(res.body).toEqual([
      // Más reciente primero, como el catálogo completo.
      {
        id: zoneColombia.id,
        name: 'Bodega',
        manufacturingPlant: { id: plants.manizales.id, name: 'Manizales' },
        area: null,
      },
      {
        id: zone.id,
        name: 'Pasillo norte',
        manufacturingPlant: { id: plants.tepotzotlan.id, name: 'Tepotzotlán' },
        area: { id: area.id, name: 'Almacén' },
      },
    ]);
  });

  it('respeta los filtros: planta y solo con área', async () => {
    const { plants } = e2e.base;

    const byPlant = await e2e
      .call(
        'get',
        `/zones?view=options&manufacturingPlantId=${plants.manizales.id}`,
        e2e.tokens.admin,
      )
      .expect(200);
    expect(byPlant.body.map(({ name }) => name)).toEqual(['Bodega']);

    const withArea = await e2e
      .call('get', '/zones?view=options&withArea=true', e2e.tokens.admin)
      .expect(200);
    expect(withArea.body.map(({ name }) => name)).toEqual(['Pasillo norte']);
  });

  it('sin view responde el catálogo completo, como antes', async () => {
    const res = await e2e.call('get', '/zones', e2e.tokens.admin).expect(200);

    expect(res.body[0]).toHaveProperty('createdBy');
    expect(res.body[0]).toHaveProperty('isActive');
  });
});
