import { buildInspectionFileName } from './extinguisher-inspection-file-name';
import { inspectionStoredWallClockToInstant } from './extinguisher-inspection-storage-timezones';

describe('buildInspectionFileName', () => {
  it('México: hora de México y UTC-06', () => {
    expect(
      buildInspectionFileName({
        id: 2,
        plantName: 'Tepotzotlán',
        countryName: 'México',
        storedCreatedAt: '2026-05-19 15:37:33.259',
      }),
    ).toBe('RGOSGSST49_2_Tepotzotlan_2026-05-19_1537_UTC-06.xlsx');
  });

  it('Colombia: guardado en hora de México, se muestra en hora de Bogotá y UTC-05', () => {
    expect(
      buildInspectionFileName({
        id: 4,
        plantName: 'Hada International',
        countryName: 'Colombia',
        storedCreatedAt: '2026-10-05 09:21:02.784',
      }),
    ).toBe('RGOSGSST49_4_Hada-International_2026-10-05_1021_UTC-05.xlsx');
  });

  it('no depende de quién descarga: es una función solo de los datos guardados', () => {
    const parts = {
      id: 48,
      plantName: 'Tepotzotlán',
      countryName: 'México',
      storedCreatedAt: '2026-03-09 14:15:00',
    };
    expect(buildInspectionFileName(parts)).toBe(
      'RGOSGSST49_48_Tepotzotlan_2026-03-09_1415_UTC-06.xlsx',
    );
    expect(buildInspectionFileName(parts)).toBe(buildInspectionFileName(parts));
  });

  it('antes del cambio de TZ del servidor el valor guardado está en UTC', () => {
    // Hoy no hay filas así; la regla las convertiría a su hora real.
    expect(
      inspectionStoredWallClockToInstant(
        'createdAt',
        'MX',
        '2026-01-15 20:00:00',
      ).toISOString(),
    ).toBe('2026-01-15T20:00:00.000Z');
    expect(
      buildInspectionFileName({
        id: 1,
        plantName: 'Tepotzotlán',
        countryName: 'México',
        storedCreatedAt: '2026-01-15 20:00:00',
      }),
    ).toBe('RGOSGSST49_1_Tepotzotlan_2026-01-15_1400_UTC-06.xlsx');
  });

  it('usa el desfase de la fecha de creación (México en julio de 2022: UTC-05)', () => {
    // Fila hipotética en UTC: muestra el horario de verano vigente entonces.
    expect(
      buildInspectionFileName({
        id: 9,
        plantName: 'Tepotzotlán',
        countryName: 'México',
        storedCreatedAt: '2022-07-15 15:00:00',
      }),
    ).toBe('RGOSGSST49_9_Tepotzotlan_2022-07-15_1000_UTC-05.xlsx');
  });

  it('sin fecha ni planta no deja partes vacías', () => {
    expect(
      buildInspectionFileName({
        id: 7,
        plantName: 'Tepotzotlán',
        storedCreatedAt: null,
      }),
    ).toBe('RGOSGSST49_7_Tepotzotlan.xlsx');
    expect(buildInspectionFileName({ id: 7 })).toBe('RGOSGSST49_7.xlsx');
  });

  it('falla si se pide una columna sin regla', () => {
    expect(() =>
      inspectionStoredWallClockToInstant(
        'updatedAt',
        'MX',
        '2026-10-05 09:21:02',
      ),
    ).toThrow(/No hay regla de zona/);
  });
});
