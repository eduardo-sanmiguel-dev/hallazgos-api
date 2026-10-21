import { MailerService } from '@nestjs-modules/mailer';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { existsSync } from 'fs';
import { join } from 'path';

import { ENV_DEVELOPMENT, ENV_PRODUCTION } from '@shared/constants';
import { buildEvidence, buildUser } from '@test/utils';
import { LOCAL_EVIDENCE_IMAGES_DIR, MailService } from './mail.service';

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
  };

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
        from: '"Hada app (hallazgo creado)" <app@hallazgos.test>',
        subject: 'Tepotzotlán - Condición insegura',
        template: './create',
        context: {
          id: 42,
          supervisor: 'S1 / S2',
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
      expect(sendMail.mock.calls[1][0]).not.toHaveProperty('attachments');
    });

    it('si el envío falla lo registra y no lanza', async () => {
      sendMail.mockRejectedValue(new Error('SMTP caído'));
      const logError = jest
        .spyOn(Logger.prototype, 'error')
        .mockImplementation();

      await expect(
        service.sendCreate({ user: recipient, evidenceCurrent: evidence() }),
      ).resolves.toBeUndefined();
      expect(logError).toHaveBeenCalledWith(
        expect.stringContaining('SMTP caído'),
      );
      logError.mockRestore();
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
          currentResponsibles: 'R2 / R3',
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
      expect(sent()).not.toHaveProperty('attachments');
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
        resolutionDays: '2 dias',
        resolutionStatus: 'En tiempo',
        resolutionOnTime: true,
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
        resolutionDays: '20 dias',
        resolutionStatus: 'Fuera de tiempo (12 dias)',
        resolutionOnTime: false,
      });
      expect(sent().attachments).toEqual([]);
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
        resolutionDays: '1 dia',
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
      ]);
    });

    it('sin imágenes no adjunta nada', async () => {
      await service.sendInProgress({
        user: recipient,
        startedBy: actor,
        evidenceCurrent: evidence({ imgEvidence: '', imgProcess: null }),
      });

      expect(sent().attachments).toEqual([]);
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
        from: '"Hada app (hallazgo cancelado)" <app@hallazgos.test>',
        template: './cancel',
        context: { cancelledByName: 'Supervisor Uno', supervisor: 'S1 / S2' },
      });
    });

    it('sin imagen no adjunta', async () => {
      await service.sendCancel({
        cancelledBy: actor,
        user: recipient,
        evidenceCurrent: evidence({ imgEvidence: '' }),
      });

      expect(sent()).not.toHaveProperty('attachments');
    });
  });

  it('sendForgotPassword manda el enlace con el token', async () => {
    await service.sendForgotPassword('ana@hallazgos.test', 'tok123');

    expect(sent()).toMatchObject({
      to: 'ana@hallazgos.test',
      subject: 'Restablecimiento de contraseña',
      template: './forgot-password',
      context: {
        token: 'tok123',
        resetLink: 'https://ui.test/restore?token=tok123',
      },
    });
  });
});
