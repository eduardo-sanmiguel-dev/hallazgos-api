import { MailerService } from '@nestjs-modules/mailer';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { existsSync } from 'fs';
import { join } from 'path';

import { ENV_DEVELOPMENT, ENV_PRODUCTION } from '../shared/constants/index.js';
import { buildEvidence, buildUser } from '../../test/utils/index.js';
import { LOCAL_EVIDENCE_IMAGES_DIR, MailService } from './mail.service.js';

const DAY = 24 * 60 * 60 * 1000;

describe('MailService', () => {
  let service: MailService;
  let sendMail: jest.Mock;

  const recipient = buildUser({ email: 'ana@hallazgos.test', name: 'Ana' });
  const actor = buildUser({ name: 'Supervisor Uno' });

  const setup = async (environment = ENV_PRODUCTION) => {
    sendMail = jest.fn().mockResolvedValue(undefined);
    const moduleRef = await Test.createTestingModule({
      providers: [
        MailService,
        { provide: MailerService, useValue: { sendMail } },
        {
          provide: ConfigService,
          useValue: {
            get: (key: string) =>
              ({
                'email.user': 'app@hallazgos.test',
                frontendUrl: 'https://ui.test/restore',
                environment,
              })[key],
          },
        },
      ],
    }).compile();
    service = moduleRef.get(MailService);
    // Las fotos de prueba (uuid-*.png) no existen en disco: se simula que sí.
    imageOnDisk = jest
      .spyOn(service as never, 'imageOnDisk')
      .mockReturnValue(true as never);
  };
  let imageOnDisk: jest.SpyInstance;

  const evidence = (overrides = {}) =>
    buildEvidence({
      id: 42,
      user: buildUser({ name: 'Quien reporta' }),
      supervisors: [buildUser({ name: 'S1' }), buildUser({ name: 'S2' })],
      createdAt: new Date(Date.now() - 3 * DAY),
      priorityDays: 8,
      ...overrides,
    });
  const sent = () => sendMail.mock.calls[0][0];
  // Fotos adjuntas, sin los logos (van en todos los correos).
  const photoCids = (mail = sent()) =>
    mail.attachments
      .map(({ cid }) => cid)
      .filter((cid) => !cid.startsWith('logo'));

  beforeEach(() => setup());

  it('la carpeta local de imágenes es <proyecto>/public/static/images/evidences', () => {
    expect(LOCAL_EVIDENCE_IMAGES_DIR).toBe(
      join(process.cwd(), 'public', 'static', 'images', 'evidences'),
    );
    expect(existsSync(LOCAL_EVIDENCE_IMAGES_DIR)).toBe(true);
  });

  describe('sendCreate', () => {
    it('manda el hallazgo con su prioridad, días restantes e imagen adjunta desde disco', async () => {
      await service.sendCreate({
        user: recipient,
        evidenceCurrent: evidence(),
      });

      expect(sent()).toMatchObject({
        to: 'ana@hallazgos.test',
        from: '"ComportArte (hallazgo creado)" <app@hallazgos.test>',
        // Mismo asunto en todos los avisos del hallazgo: una conversación.
        subject: 'Hallazgo #42 · Tepotzotlán - Condición insegura',
        template: './create',
        context: {
          id: 42,
          supervisor: 'S1, S2',
          userWhoCreated: 'Quien reporta',
          priorityLabel: 'Corto plazo (8 dias)',
          remainingDays: '5',
        },
        attachments: [
          {
            filename: 'uuid-evidence.png',
            path: join(LOCAL_EVIDENCE_IMAGES_DIR, 'uuid-evidence.png'),
            cid: 'imgEvidence',
          },
          { cid: 'logoHada' },
          { cid: 'logoComportarte' },
        ],
      });
    });

    it('prioridad fuera del catálogo muestra solo los días; sin prioridad, vacío', async () => {
      await service.sendCreate({
        user: recipient,
        evidenceCurrent: evidence({ priorityDays: 5 }),
      });
      await service.sendCreate({
        user: recipient,
        evidenceCurrent: evidence({ priorityDays: null, imgEvidence: '' }),
      });

      expect(sendMail.mock.calls[0][0].context.priorityLabel).toBe('5 dias');
      expect(sendMail.mock.calls[1][0].context).toMatchObject({
        priorityLabel: '',
        remainingDays: '',
      });
      expect(photoCids(sendMail.mock.calls[1][0])).toEqual([]);
    });

    it('propaga un rechazo SMTP para que el worker pueda clasificarlo', async () => {
      sendMail.mockRejectedValue(new Error('SMTP caído'));
      await expect(
        service.sendCreate({ user: recipient, evidenceCurrent: evidence() }),
      ).rejects.toThrow('SMTP caído');
    });
  });

  describe('fotos que no están en disco', () => {
    // Hallazgos del seeder guardan "seed-evidence.png", que no existe: antes
    // el correo fallaba con ENOENT y revertía el cierre (500).
    const seeded = () =>
      evidence({
        imgEvidence: 'seed-evidence.png',
        imgSolution: 'uuid-solution.png',
        solutionDate: new Date(),
      });

    beforeEach(() =>
      imageOnDisk.mockImplementation(
        ((fileName: string) => !fileName.startsWith('seed-')) as never,
      ),
    );

    it('el correo de solución sale sin la foto faltante ni su referencia', async () => {
      const current = seeded();
      await service.sendSolution({ user: recipient, evidenceCurrent: current });

      expect(photoCids()).toEqual(['imgSolution']);
      expect(JSON.stringify(sent().context)).not.toContain('cid":"imgEvidence');
      // No modifica el hallazgo original.
      expect(current.imgEvidence).toBe('seed-evidence.png');
    });

    it.each([
      [
        'sendCreate',
        () =>
          service.sendCreate({ user: recipient, evidenceCurrent: seeded() }),
      ],
      [
        'sendInProgress',
        () =>
          service.sendInProgress({
            user: recipient,
            startedBy: actor,
            evidenceCurrent: seeded(),
          }),
      ],
      [
        'sendCancel',
        () =>
          service.sendCancel({
            user: recipient,
            cancelledBy: actor,
            evidenceCurrent: seeded(),
          }),
      ],
      [
        'sendReassign',
        () =>
          service.sendReassign({
            user: recipient,
            reassignedBy: actor,
            evidenceCurrent: seeded(),
            previousResponsibles: [],
            currentResponsibles: [],
          }),
      ],
    ])('%s no adjunta la foto faltante', async (_, send) => {
      await send();
      expect(photoCids()).not.toContain('imgEvidence');
    });

    it('la verificación real usa el disco: un archivo inexistente cuenta como faltante', () => {
      imageOnDisk.mockRestore();
      expect(
        (
          service as unknown as { imageOnDisk: (f: string) => boolean }
        ).imageOnDisk('seed-evidence.png'),
      ).toBe(false);
      expect(
        (
          service as unknown as { imageOnDisk: (f: string) => boolean }
        ).imageOnDisk('../escape.png'),
      ).toBe(false);
    });
  });

  describe('en desarrollo', () => {
    beforeEach(() => setup(ENV_DEVELOPMENT));

    it('todo va a la cuenta de pruebas y las imágenes se leen del disco', async () => {
      await service.sendCreate({
        user: recipient,
        evidenceCurrent: evidence(),
      });

      expect(sent().to).toBe('eduardo-266@hotmail.com');
      expect(sent().attachments[0].path).toBe(
        join(LOCAL_EVIDENCE_IMAGES_DIR, 'uuid-evidence.png'),
      );
    });
  });

  describe('sendReassign', () => {
    it('lista responsables anteriores y actuales y quién reasignó', async () => {
      await service.sendReassign({
        user: recipient,
        reassignedBy: actor,
        evidenceCurrent: evidence(),
        previousResponsibles: [buildUser({ name: 'R1' })],
        currentResponsibles: [
          buildUser({ name: 'R2' }),
          buildUser({ name: 'R3' }),
        ],
      });

      expect(sent()).toMatchObject({
        template: './reassign',
        context: {
          reassignedBy: 'Supervisor Uno',
          previousResponsibles: 'R1',
          currentResponsibles: 'R2, R3',
        },
      });
    });

    it('sin responsables usa textos por defecto y sin imagen no adjunta', async () => {
      await service.sendReassign({
        user: recipient,
        reassignedBy: actor,
        evidenceCurrent: evidence({ imgEvidence: '' }),
        previousResponsibles: [],
        currentResponsibles: [],
      });

      expect(sent().context).toMatchObject({
        previousResponsibles: 'Sin responsables previos',
        currentResponsibles: 'Sin responsables asignados',
      });
      expect(photoCids()).toEqual([]);
    });

    it('un error de envío se propaga (lo registra quien llama)', async () => {
      sendMail.mockRejectedValue(new Error('SMTP caído'));

      await expect(
        service.sendReassign({
          user: recipient,
          reassignedBy: actor,
          evidenceCurrent: evidence(),
          previousResponsibles: [],
          currentResponsibles: [],
        }),
      ).rejects.toThrow('SMTP caído');
    });
  });

  describe('sendSolution', () => {
    it('adjunta la imagen de solución desde el disco (ruta válida también en Linux)', async () => {
      await service.sendSolution({
        user: recipient,
        evidenceCurrent: evidence({
          imgSolution: 'uuid-solution.png',
          solutionDate: new Date(Date.now() - 1 * DAY),
          descriptionSolution: 'Se limpió',
        }),
      });

      const [evidenceImage, solutionImage] = sent().attachments;
      expect(evidenceImage.cid).toBe('imgEvidence');
      expect(solutionImage).toEqual({
        filename: 'uuid-solution.png',
        path: join(LOCAL_EVIDENCE_IMAGES_DIR, 'uuid-solution.png'),
        cid: 'imgSolution',
      });
      expect(solutionImage.path).not.toContain('mail..');
      expect(sent().context).toMatchObject({
        descripcionSolucion: 'Se limpió',
        resolutionDays: '2 días',
        resolutionStatus: 'En tiempo',
        resolutionOnTime: true,
      });
    });

    it('incluye quién lo inició (con la fecha) y quién lo cerró', async () => {
      await service.sendSolution({
        user: recipient,
        evidenceCurrent: evidence({
          startProcessDate: new Date(2026, 9, 21, 9, 30),
          solutionDate: new Date(2026, 9, 22, 10, 0),
          startedBy: { id: 11, name: 'Ana Supervisora' } as never,
          closedBy: { id: 12, name: 'Luis Responsable' } as never,
        }),
      });

      expect(sent().context).toMatchObject({
        startedBy: 'Ana Supervisora',
        startProcessDate: '21 de octubre de 2026 9:30',
        closedBy: 'Luis Responsable',
      });
    });

    it('en hallazgos sin ese registro, los campos van vacíos', async () => {
      await service.sendSolution({
        user: recipient,
        evidenceCurrent: evidence({ solutionDate: new Date() }),
      });

      expect(sent().context).toMatchObject({
        startedBy: '',
        startProcessDate: '',
        closedBy: '',
      });
    });

    it('resuelto después de la prioridad: fuera de tiempo con los días de retraso', async () => {
      await service.sendSolution({
        user: recipient,
        evidenceCurrent: evidence({
          createdAt: new Date(Date.now() - 20 * DAY),
          solutionDate: new Date(),
          imgEvidence: '',
        }),
      });

      expect(sent().context).toMatchObject({
        resolutionDays: '20 días',
        resolutionStatus: 'Fuera de tiempo (12 días)',
        resolutionOnTime: false,
      });
      expect(photoCids()).toEqual([]);
    });

    it('sin prioridad siempre está en tiempo; sin fecha de solución no hay resolución', async () => {
      await service.sendSolution({
        user: recipient,
        evidenceCurrent: evidence({
          priorityDays: null,
          solutionDate: new Date(Date.now() - 2 * DAY),
        }),
      });
      await service.sendSolution({
        user: recipient,
        evidenceCurrent: evidence({ solutionDate: null }),
      });

      expect(sendMail.mock.calls[0][0].context).toMatchObject({
        resolutionDays: '1 día',
        resolutionStatus: '',
        resolutionOnTime: true,
      });
      expect(sendMail.mock.calls[1][0].context).toMatchObject({
        resolutionDays: '',
        resolutionOnTime: true,
      });
    });

    it('conserva las fechas en español y la duración en el correo de solución', async () => {
      await service.sendSolution({
        user: recipient,
        evidenceCurrent: evidence({
          createdAt: new Date(2026, 9, 20, 8, 5),
          solutionDate: new Date(2026, 9, 20, 9, 6, 1),
        }),
      });

      expect(sent().context).toMatchObject({
        createdAt: '20 de octubre de 2026 8:05',
        solutionDate: '20 de octubre de 2026 9:06',
        durantionToTime: '1h 1m 1s',
      });
    });

    it('fechas inválidas no rompen el correo', async () => {
      await service.sendSolution({
        user: recipient,
        evidenceCurrent: evidence({ solutionDate: 'no-es-fecha' as never }),
      });

      expect(sent().context).toMatchObject({
        resolutionDays: '',
        solutionDate: 'Fecha inválida',
        durantionToTime: '  ',
      });
    });
  });

  describe('sendInProgress', () => {
    it('indica quién lo inició y adjunta evidencia y proceso', async () => {
      await service.sendInProgress({
        user: recipient,
        startedBy: actor,
        evidenceCurrent: evidence({
          imgProcess: 'uuid-process.png',
          startProcessDate: new Date(),
        }),
      });

      expect(sent()).toMatchObject({
        template: './in-progress',
        context: { startedBy: 'Supervisor Uno' },
      });
      expect(sent().attachments.map(({ cid }) => cid)).toEqual([
        'imgEvidence',
        'imgProcess',
        'logoHada',
        'logoComportarte',
      ]);
    });

    it('sin imágenes no adjunta nada', async () => {
      await service.sendInProgress({
        user: recipient,
        startedBy: actor,
        evidenceCurrent: evidence({ imgEvidence: '', imgProcess: null }),
      });

      expect(photoCids()).toEqual([]);
    });
  });

  describe('sendCancel', () => {
    it('indica quién canceló', async () => {
      await service.sendCancel({
        cancelledBy: actor,
        user: recipient,
        evidenceCurrent: evidence(),
      });

      expect(sent()).toMatchObject({
        from: '"ComportArte (hallazgo cancelado)" <app@hallazgos.test>',
        template: './cancel',
        context: { cancelledByName: 'Supervisor Uno', supervisor: 'S1, S2' },
      });
    });

    it('sin imagen no adjunta', async () => {
      await service.sendCancel({
        cancelledBy: actor,
        user: recipient,
        evidenceCurrent: evidence({ imgEvidence: '' }),
      });

      expect(photoCids()).toEqual([]);
    });
  });

  it('sendForgotPassword manda el enlace con el token', async () => {
    await service.sendForgotPassword('ana@hallazgos.test', 'tok123');

    expect(sent()).toMatchObject({
      to: 'ana@hallazgos.test',
      from: '"ComportArte (restablecimiento de contraseña)" <app@hallazgos.test>',
      subject: 'Restablecimiento de contraseña',
      template: './forgot-password',
      context: {
        token: 'tok123',
        resetLink: 'https://ui.test/restore?token=tok123',
      },
    });
  });
});
