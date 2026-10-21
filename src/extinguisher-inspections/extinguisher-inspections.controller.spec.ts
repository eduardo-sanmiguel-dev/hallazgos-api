import { NotFoundException } from '@nestjs/common';
import XlsxPopulate from 'xlsx-populate';

import { describeCrudContract } from '../../test/utils/index.js';
import { ExtinguisherInspectionsController } from './extinguisher-inspections.controller.js';
import { ExtinguisherInspectionsService } from './extinguisher-inspections.service.js';

const validEvaluation = {
  location: 'Almacén norte',
  extinguisherNumber: 'F4E-321',
  typeOfExtinguisher: 'PQS',
  capacity: 6,
  pressureManometer: 'C',
  valve: 'C',
  hose: 'NC',
  cylinder: 'C',
  barrette: 'C',
  seal: 'C',
  cornet: 'C',
  access: 'C',
  support: 'NA',
  nextRechargeDate: '2026-12-01',
  maintenanceDate: '2026-11-01',
};

describeCrudContract({
  path: '/extinguisher-inspections',
  controller: ExtinguisherInspectionsController,
  service: ExtinguisherInspectionsService,
  create: {
    valid: { manufacturingPlantId: 1, evaluations: [validEvaluation] },
    invalid: [
      ['sin evaluaciones', { manufacturingPlantId: 1, evaluations: [] }],
      [
        'con un número de extintor con espacios',
        {
          manufacturingPlantId: 1,
          evaluations: [{ ...validEvaluation, extinguisherNumber: 'F 4' }],
        },
      ],
      [
        'con un valor de evaluación inválido',
        {
          manufacturingPlantId: 1,
          evaluations: [{ ...validEvaluation, valve: 'OK' }],
        },
      ],
      [
        'con capacidad de más de 2 decimales',
        {
          manufacturingPlantId: 1,
          evaluations: [{ ...validEvaluation, capacity: 1.234 }],
        },
      ],
    ],
  },
  list: {
    query: { search: 'F4', startDate: '2026-01-01', page: '1', limit: '10' },
    expected: { search: 'F4', startDate: '2026-01-01', page: 1, limit: 10 },
    invalid: [['con fecha en otro formato', { endDate: '31/12/2026' }]],
  },
  findOne: true,
  update: { valid: { manufacturingPlantId: 2 } },
  remove: true,
});

describe('GET /extinguisher-inspections/download/file/:id (Excel)', () => {
  // Cada prueba genera el Excel completo desde la plantilla real (lento).
  jest.setTimeout(30_000);

  // Se llama al controlador directamente (sin HTTP): las rutas y la
  // validación ya las cubre el contrato de arriba, y por HTTP la descarga
  // binaria era intermitente (ECONNRESET) con la suite en paralelo.
  let controller: ExtinguisherInspectionsController;
  let service: jest.Mocked<ExtinguisherInspectionsService>;

  const row = (i: number, overrides: object = {}) => ({
    location: `Ubicación ${i}`,
    extinguisherNumber: `EXT-${i}`,
    typeOfExtinguisher: 'PQS',
    capacity: 6,
    pressureManometer: 'C',
    valve: 'NC',
    hose: null,
    cylinder: 'C',
    barrette: 'C',
    seal: 'C',
    cornet: 'C',
    access: 'C',
    support: 'C',
    signaling: null,
    nextRechargeDate: '2026-12-01',
    maintenanceDate: '2026-11-15',
    observations: '',
    ...overrides,
  });

  beforeEach(() => {
    service = {
      findOne: jest.fn(),
      getDownloadFileName: jest.fn().mockResolvedValue('Inspeccion_30.xlsx'),
    } as unknown as jest.Mocked<ExtinguisherInspectionsService>;
    controller = new ExtinguisherInspectionsController(service);
  });

  const download = async (evaluations: object[], overrides: object = {}) => {
    service.findOne.mockResolvedValue({
      id: 30,
      inspectionDate: '2026-10-20',
      responsible: { name: 'Ana' },
      manufacturingPlant: { name: 'Tepotzotlán' },
      evaluations,
      ...overrides,
    } as never);

    const res = { setHeader: jest.fn(), send: jest.fn() };
    await controller.downloadFile('30', res as never);

    const workbook = await XlsxPopulate.fromDataAsync(
      res.send.mock.calls[0][0],
    );
    return {
      res,
      sheets: workbook
        .sheets()
        .filter((sheet) => sheet.name().startsWith('RESGISTRO EXTINTORES')),
    };
  };

  it('llena el encabezado y una fila por extintor, con valores por defecto', async () => {
    const { res, sheets } = await download([row(1), row(2)]);

    expect(service.findOne).toHaveBeenCalledWith(30);
    expect(res.setHeader).toHaveBeenCalledWith(
      'Content-Disposition',
      expect.stringContaining('filename="Inspeccion_30.xlsx"'),
    );
    expect(res.setHeader).toHaveBeenCalledWith(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    expect(sheets.length).toBeGreaterThan(0);
    const [sheet] = sheets;
    expect(sheet.cell('B4').value()).toBe('RESPONSABLE: Ana');
    expect(sheet.cell('I4').value()).toBe('20/10/2026');
    expect(sheet.cell('R4').value()).toBe('Tepotzotlán');
    expect(sheet.cell('B9').value()).toBe('Ubicación 1');
    expect(sheet.cell('C9').value()).toBe('EXT-1');
    expect(sheet.cell('G9').value()).toBe('NC');
    // Sin valor se marca "C" (cumple).
    expect(sheet.cell('H9').value()).toBe('C');
    expect(sheet.cell('P9').value()).toBe('01/12/2026');
    expect(sheet.cell('Q9').value()).toBe('15/11/2026');
    expect(sheet.cell('B10').value()).toBe('Ubicación 2');
    // Las filas sin extintor quedan vacías.
    expect(sheet.cell('B11').value()).toBeUndefined();
    expect(sheet.column('C').width()).toBe(10);
  });

  it('sin responsable ni planta muestra "-"', async () => {
    const { sheets } = await download(
      [row(1, { location: '', extinguisherNumber: '' })],
      {
        responsible: null,
        manufacturingPlant: null,
      },
    );

    expect(sheets[0].cell('B4').value()).toBe('RESPONSABLE: -');
    expect(sheets[0].cell('R4').value()).toBe('-');
    expect(sheets[0].cell('B9').value()).toBe('-');
  });

  it('con más extintores que la plantilla agrega filas y baja el pie de página', async () => {
    // 27 = una fila más que la capacidad de la plantilla (26).
    const many = Array.from({ length: 27 }, (_, i) => row(i + 1));
    const { sheets } = await download(many);
    const [sheet] = sheets;

    // 27 filas desde la 9 → última fila de datos 35, pie en la 36.
    expect(sheet.cell('B35').value()).toBe('Ubicación 27');
    expect(sheet.cell('B36').value()).not.toBeUndefined();
    expect(sheet.cell('B36').value()).not.toBe('Ubicación 28');
  });

  it('ajusta la altura de la fila cuando las observaciones son largas', async () => {
    const longText = 'Observación muy larga que no cabe en una línea. '.repeat(
      6,
    );
    const { sheets } = await download([row(1, { observations: longText })]);
    const [sheet] = sheets;

    expect(sheet.cell('R9').value()).toBe(longText);
    expect(sheet.row(9).height()).toBeGreaterThan(15);
  });

  it('propaga el 404 si la inspección no existe', async () => {
    service.findOne.mockRejectedValue(new NotFoundException());

    await expect(
      controller.downloadFile('31', {
        setHeader: jest.fn(),
        send: jest.fn(),
      } as never),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
