import { buildFileNameTimestamp } from '../shared/utils/file-name';
import { EPP_FILE_NAME_MAX_LENGTH, buildEppFileName } from './epp-file-name';

const at = new Date('2026-10-08T14:40:00Z');
const mx = buildFileNameTimestamp('America/Mexico_City', at);

describe('buildFileNameTimestamp', () => {
  it('usa la zona del usuario', () => {
    expect(mx).toBe('2026-10-08_0840_UTC-06');
    expect(buildFileNameTimestamp('America/Bogota', at)).toBe(
      '2026-10-08_0940_UTC-05',
    );
  });

  it('usa America/Mexico_City si la zona no llega o no es válida', () => {
    expect(buildFileNameTimestamp(undefined, at)).toBe(mx);
    expect(buildFileNameTimestamp('Mars/Olympus', at)).toBe(mx);
  });
});

describe('buildEppFileName', () => {
  it('arma el ejemplo esperado', () => {
    expect(
      buildEppFileName({
        plants: ['Tepotzotlán'],
        code: 11056,
        employeeName: 'AGUILAR BRAVO JAQUELINE',
        position: 'Operario de Aseo',
        timestamp: mx,
      }),
    ).toBe(
      'EPP_Tepotzotlan_11056_AguilarBravoJaqueline_OperarioDeAseo_2026-10-08_0840_UTC-06.xlsx',
    );
  });

  it('quita acentos y Ñ del nombre y del cargo', () => {
    expect(
      buildEppFileName({
        plants: ['Tepotzotlán'],
        code: 11132,
        employeeName: 'ZUÑIGA MERCADO MARELY JOCELYN',
        position: 'Técnico de Señalización / Turno: 2',
        timestamp: mx,
      }),
    ).toBe(
      'EPP_Tepotzotlan_11132_ZunigaMercadoMarelyJocelyn_TecnicoDeSenalizacionTurno2_2026-10-08_0840_UTC-06.xlsx',
    );
  });

  it('omite cargo y número vacíos sin dejar partes vacías', () => {
    expect(
      buildEppFileName({
        plants: ['Manizales'],
        code: null,
        employeeName: 'Ana Pérez',
        position: undefined,
        timestamp: mx,
      }),
    ).toBe('EPP_Manizales_AnaPerez_2026-10-08_0840_UTC-06.xlsx');
  });

  it('une varias plantas y limpia espacios', () => {
    expect(
      buildEppFileName({
        plants: ['Tepotzotlán', 'Hada International'],
        code: '1',
        employeeName: 'X',
        position: 'Y',
        timestamp: mx,
      }),
    ).toBe(
      'EPP_Tepotzotlan+Hada-International_1_X_Y_2026-10-08_0840_UTC-06.xlsx',
    );
  });

  it('recorta primero el nombre (apellidos + primer nombre) y después el cargo', () => {
    const base = {
      plants: ['Hada International'],
      code: 1143165025,
      timestamp: mx,
    };
    const longName =
      'DE LA ROSA MONTENEGRO MARIA DEL PILAR GUADALUPE ALEJANDRA';
    const longPosition =
      'Analista de control de calidad y aseguramiento de procesos productivos nivel 2';

    const fileName = buildEppFileName({
      ...base,
      employeeName: longName,
      position: longPosition,
    });

    expect(fileName.length).toBeLessThanOrEqual(EPP_FILE_NAME_MAX_LENGTH);
    expect(fileName).toMatch(/^EPP_Hada-International_1143165025_DeLaRosa_/);
    expect(fileName).toMatch(/_2026-10-08_0840_UTC-06\.xlsx$/);

    const extreme = buildEppFileName({
      ...base,
      employeeName: 'A'.repeat(300),
      position: 'B'.repeat(300),
    });
    expect(extreme.length).toBeLessThanOrEqual(EPP_FILE_NAME_MAX_LENGTH);
    expect(extreme).toMatch(
      /^EPP_Hada-International_1143165025_Aa+_2026-10-08_0840_UTC-06\.xlsx$/,
    );
  });
});
