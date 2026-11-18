import { buildEvidence } from '../../test/utils/index.js';
import {
  deadlineTile,
  evidenceDetails,
  evidenceSteps,
  preheader,
  textTile,
} from './mail.view.js';

describe('mail.view', () => {
  describe('deadlineTile', () => {
    it('vencido indica hace cuántos días (en singular si es uno)', () => {
      expect(deadlineTile('-1')).toMatchObject({
        value: 'Vencido',
        hint: 'Hace 1 día',
      });
      expect(deadlineTile('-3')).toMatchObject({ hint: 'Hace 3 días' });
    });

    it('el día del vencimiento dice "Hoy"', () => {
      expect(deadlineTile('0')).toMatchObject({
        value: 'Hoy',
        hint: 'Vence hoy',
      });
    });

    it('con días restantes los muestra en verde', () => {
      expect(deadlineTile('1')).toMatchObject({
        value: '1 día',
        hint: 'Para atenderlo',
      });
    });
  });

  it('textTile sin valor muestra un guion largo', () => {
    expect(textTile('')).toMatchObject({ value: '—', hint: '' });
  });

  it('evidenceSteps sin quien reportó deja la persona vacía', () => {
    const [registered] = evidenceSteps(
      buildEvidence({ user: null }),
      '#000000',
    );

    expect(registered).toMatchObject({ label: 'Registrado', person: '' });
  });

  it('evidenceDetails omite los datos que faltan', () => {
    const rows = evidenceDetails(
      buildEvidence({
        manufacturingPlant: null,
        zone: null,
        process: null,
        mainType: null,
        secondaryType: null,
        user: null,
        supervisors: null,
        responsibles: undefined,
      }),
    );

    expect(rows).toEqual([]);
  });

  it('preheader recorta textos largos a ~110 caracteres con "…"', () => {
    const text = preheader('palabra '.repeat(30));

    expect(text.length).toBeLessThanOrEqual(110);
    expect(text.endsWith('…')).toBe(true);
    expect(preheader('  corto   texto ')).toBe('corto texto');
  });
});
