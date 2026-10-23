import { BadRequestException } from '@nestjs/common';

import { resolveBiEppPeriod } from './bi-epp-period.js';

const TODAY = '2026-10-22';
const period = (start?: string, end?: string, today = TODAY) =>
  resolveBiEppPeriod(start, end, today);

describe('resolveBiEppPeriod', () => {
  it('sin fechas: el mes en curso a la fecha vs los mismos días del anterior', () => {
    expect(period()).toEqual({
      actual: { desde: '2026-10-01', hasta: '2026-10-22' },
      anterior: { desde: '2026-09-01', hasta: '2026-09-22' },
    });
  });

  it('el primer día del mes se compara con el primer día del anterior', () => {
    expect(period(undefined, undefined, '2026-11-01')).toEqual({
      actual: { desde: '2026-11-01', hasta: '2026-11-01' },
      anterior: { desde: '2026-10-01', hasta: '2026-10-01' },
    });
  });

  it('un mes completo se compara con el mes previo completo', () => {
    expect(period('01/09/2026', '30/09/2026').anterior).toEqual({
      desde: '2026-08-01',
      hasta: '2026-08-31',
    });
    expect(period('01/03/2026', '31/03/2026').anterior).toEqual({
      desde: '2026-02-01',
      hasta: '2026-02-28',
    });
  });

  it('a la fecha recorta el mes anterior si es más corto', () => {
    expect(period('01/03/2026', '30/03/2026').anterior).toEqual({
      desde: '2026-02-01',
      hasta: '2026-02-28',
    });
  });

  it('varios meses desde un día 1: los mismos días de los meses previos', () => {
    expect(period('01/08/2026', '22/10/2026').anterior).toEqual({
      desde: '2026-05-01',
      hasta: '2026-07-22',
    });
  });

  it('desde el 1 de enero: mismas fechas del año anterior', () => {
    expect(period('01/01/2026', '22/10/2026').anterior).toEqual({
      desde: '2025-01-01',
      hasta: '2025-10-22',
    });
  });

  it('otro rango: el periodo inmediato anterior de igual duración', () => {
    expect(period('10/10/2026', '19/10/2026').anterior).toEqual({
      desde: '2026-09-30',
      hasta: '2026-10-09',
    });
  });

  it.each([
    ['solo una fecha', '01/10/2026', undefined],
    ['formato incorrecto', '2026-10-01', '2026-10-22'],
    ['fecha inexistente', '31/02/2026', '05/03/2026'],
    ['inicio después del fin', '22/10/2026', '01/10/2026'],
    ['más de 3 años', '01/01/2020', '22/10/2026'],
  ])('rechaza %s', (_, start, end) => {
    expect(() => period(start, end)).toThrow(BadRequestException);
  });
});
