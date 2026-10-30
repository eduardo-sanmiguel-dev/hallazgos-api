import { MailerService } from '@nestjs-modules/mailer';
import { HandlebarsAdapter } from '@nestjs-modules/mailer/adapters/handlebars.adapter';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { existsSync } from 'fs';

import { ENV_PRODUCTION } from '../shared/constants/index.js';
import { buildEvidence, buildUser } from '../../test/utils/index.js';
import { MailService } from './mail.service.js';
import { mailTemplateConfig } from './mail.templates.js';

// Render real de cada plantilla (Handlebars en modo estricto, con partials y
// CSS en línea): ningún campo falta, cada imagen apunta a un adjunto que sí
// se envía y el texto de los usuarios sale escapado.

const DAY = 24 * 60 * 60 * 1000;

interface SentMail {
  template: string;
  context: Record<string, unknown>;
  attachments: { cid: string; path: string }[];
}

const render = (mail: SentMail) =>
  new Promise<string>((resolve, reject) => {
    const message = {
      data: { template: mail.template, context: mail.context, html: '' },
    };
    new HandlebarsAdapter().compile(
      message,
      (error?: Error) => (error ? reject(error) : resolve(message.data.html)),
      mailTemplateConfig() as never,
    );
  });

const cids = (html: string) =>
  [
    ...new Set([...html.matchAll(/cid:([\w-]+)/g)].map(([, cid]) => cid)),
  ].sort();

describe('Plantillas de correo', () => {
  let service: MailService;
  let sendMail: jest.Mock;

  const setup = async (frontendUrl?: string) => {
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
                frontendUrl,
                environment: ENV_PRODUCTION,
              })[key],
          },
        },
      ],
    }).compile();
    service = moduleRef.get(MailService);
  };

  beforeEach(() => setup('https://ui.test/restore'));

  const recipient = buildUser({ email: 'ana@hallazgos.test' });
  const actor = buildUser({ name: 'Supervisor Uno' });
  const evidence = (overrides = {}) =>
    buildEvidence({
      id: 42,
      createdAt: new Date(Date.now() - 3 * DAY),
      priorityDays: 8,
      ...overrides,
    });

  const withPhotos = {
    imgEvidence: 'uuid-evidence.png',
    imgProcess: 'uuid-process.png',
    imgSolution: 'uuid-solution.png',
    startProcessDate: new Date(Date.now() - 2 * DAY),
    solutionDate: new Date(Date.now() - DAY),
  };
  const withoutPhotos = {
    imgEvidence: '',
    imgProcess: null,
    imgSolution: '',
    startProcessDate: null,
    solutionDate: new Date(),
  };

  const SENDERS = {
    create: (e) => service.sendCreate({ user: recipient, evidenceCurrent: e }),
    'in-progress': (e) =>
      service.sendInProgress({
        user: recipient,
        startedBy: actor,
        evidenceCurrent: e,
      }),
    solution: (e) =>
      service.sendSolution({ user: recipient, evidenceCurrent: e }),
    reassign: (e) =>
      service.sendReassign({
        user: recipient,
        reassignedBy: actor,
        evidenceCurrent: e,
        previousResponsibles: [buildUser({ name: 'R1' })],
        currentResponsibles: [buildUser({ name: 'R2' })],
      }),
    cancel: (e) =>
      service.sendCancel({
        cancelledBy: actor,
        user: recipient,
        evidenceCurrent: e,
      }),
  } satisfies Record<string, (e: ReturnType<typeof evidence>) => Promise<void>>;

  describe.each(Object.entries(SENDERS))('%s', (_, send) => {
    it.each([
      ['con fotos', withPhotos],
      ['sin fotos', withoutPhotos],
    ])('%s: renderiza y cada imagen tiene su adjunto', async (__, photos) => {
      await send(evidence(photos));
      const mail: SentMail = sendMail.mock.calls[0][0];
      const html = await render(mail);

      expect(html).toContain('Hallazgo #42');
      expect(html).toContain('Tepotzotlán');
      expect(cids(html)).toEqual(mail.attachments.map(({ cid }) => cid).sort());
      expect(cids(html)).toEqual(
        expect.arrayContaining(['logoComportarte', 'logoHada']),
      );
      mail.attachments
        .filter(({ cid }) => cid.startsWith('logo'))
        .forEach(({ path }) => expect(existsSync(path)).toBe(true));
    });
  });

  it.each(Object.entries(SENDERS))(
    '%s lleva el botón "Ver hallazgo" al detalle en la UI',
    async (_, send) => {
      await send(evidence());
      const html = await render(sendMail.mock.calls[0][0]);

      expect(html).toContain('href="https://ui.test/hallazgos?evidenceId=42"');
      expect(html).toContain('Ver hallazgo en ComportArte');
    },
  );

  it('sin FRONTEND_URL no hay botón (y el correo se envía igual)', async () => {
    await setup(undefined);
    await service.sendCreate({ user: recipient, evidenceCurrent: evidence() });
    const html = await render(sendMail.mock.calls[0][0]);

    expect(html).not.toContain('Ver hallazgo en ComportArte');
  });

  // Mismos colores de estatus que la UI.
  it('el color sigue al estatus: nuevo en ámbar, reasignado con el estatus actual', async () => {
    await service.sendCreate({ user: recipient, evidenceCurrent: evidence() });
    await SENDERS.reassign(evidence({ status: 'En progreso' }));
    const [created, reassigned] = sendMail.mock.calls.map(
      ([mail]) => (mail.context as { theme: { accent: string } }).theme.accent,
    );

    expect(created).toBe('#b45309');
    expect(reassigned).toBe('#1d4ed8');
  });

  // El remitente lleva el nombre del sistema (antes "Hada app").
  it.each(Object.entries(SENDERS))(
    '%s sale como "ComportArte (…)"',
    async (_, send) => {
      await send(evidence());
      expect(sendMail.mock.calls[0][0].from).toMatch(
        /^"ComportArte \(hallazgo [^)]+\)" <app@hallazgos\.test>$/,
      );
    },
  );

  it('el texto de los usuarios sale escapado', async () => {
    await service.sendCreate({
      user: recipient,
      evidenceCurrent: evidence({
        description: '<img src=x onerror=alert(1)> derrame',
        user: buildUser({ name: '<b>Ana</b>' }),
      }),
    });
    const html = await render(sendMail.mock.calls[0][0]);

    expect(html).not.toContain('<img src=x');
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt; derrame');
    expect(html).not.toContain('<b>Ana</b>');
  });

  it('la solución muestra hallazgo, avance y solución en orden, y la resolución en tiempo', async () => {
    await service.sendSolution({
      user: recipient,
      evidenceCurrent: evidence({
        ...withPhotos,
        descriptionSolution: 'Se colocó charola antiderrames',
      }),
    });
    const html = await render(sendMail.mock.calls[0][0]);

    expect(html).toContain('Antes, avance y después');
    // Tres fotos lado a lado, del mismo ancho y en este orden.
    expect(cids(html)).toEqual(
      expect.arrayContaining(['imgEvidence', 'imgProcess', 'imgSolution']),
    );
    const order = ['cid:imgEvidence', 'cid:imgProcess', 'cid:imgSolution'].map(
      (cid) => html.indexOf(cid),
    );
    expect(order).toEqual([...order].sort((a, b) => a - b));
    expect(html.match(/max-width: 168px/g)).toHaveLength(3);
    expect(html).toContain('Cómo se resolvió');
    expect(html).toContain('Se colocó charola antiderrames');
    expect(html).toContain('En tiempo');
  });

  it.each(['reassign', 'cancel'] as const)(
    '%s: si ya pasó por "en progreso", también la foto del avance',
    async (name) => {
      await SENDERS[name](evidence(withPhotos));
      await SENDERS[name](evidence({ ...withPhotos, imgProcess: null }));
      const [withProcess, withoutProcess] = await Promise.all(
        sendMail.mock.calls.map(([mail]) => render(mail)),
      );

      expect(withProcess).toContain('Antes y avance');
      expect(withProcess).toContain('cid:imgProcess');
      expect(withoutProcess).toContain('Evidencia');
      expect(withoutProcess).not.toContain('cid:imgProcess');
    },
  );

  it('sin foto de avance (cerrado sin pasar por "en progreso"): antes y después', async () => {
    await service.sendSolution({
      user: recipient,
      evidenceCurrent: evidence({ ...withPhotos, imgProcess: null }),
    });
    const mail = sendMail.mock.calls[0][0];
    const html = await render(mail);

    expect(html).toContain('Antes y después');
    expect(html).not.toContain('cid:imgProcess');
    expect(html.match(/max-width: 258px/g)).toHaveLength(2);
  });

  // Etiquetas neutras: la descripción no depende de la clasificación (antes
  // decía "Descripción del comportamiento inseguro" en todos los avisos).
  it.each(Object.entries(SENDERS))(
    '%s muestra la descripción como "Lo que se observó"; sin ella, nada',
    async (_, send) => {
      await send(evidence({ description: 'Derrame en pasillo' }));
      await send(evidence({ description: '' }));
      const [withText, withoutText] = await Promise.all(
        sendMail.mock.calls.map(([mail]) => render(mail)),
      );

      expect(withText).toContain('Lo que se observó');
      expect(withText).toContain('Derrame en pasillo');
      expect(withText).not.toMatch(/comportamiento\s+inseguro/i);
      expect(withoutText).not.toContain('Lo que se observó');
    },
  );

  it('el seguimiento dice quién lo inició y quién lo cerró, con las fechas', async () => {
    await service.sendSolution({
      user: recipient,
      evidenceCurrent: evidence({
        startProcessDate: new Date(2026, 9, 1, 9, 0),
        solutionDate: new Date(2026, 9, 2, 10, 0),
        startedBy: { id: 11, name: 'Ana Supervisora' } as never,
        closedBy: { id: 12, name: 'Luis Responsable' } as never,
      }),
    });
    const html = await render(sendMail.mock.calls[0][0]);

    expect(html).toContain('Ana Supervisora');
    expect(html).toContain('1 de octubre de 2026 9:00');
    expect(html).toContain('Luis Responsable');
    expect(html).toContain('2 de octubre de 2026 10:00');
  });

  it('solucionado sin pasar por "en proceso" (hallazgos anteriores): sin registro', async () => {
    await service.sendSolution({
      user: recipient,
      evidenceCurrent: evidence({
        startProcessDate: null,
        solutionDate: new Date(),
      }),
    });
    const html = await render(sendMail.mock.calls[0][0]);

    expect(html).toContain('Sin registro');
    expect(html).not.toContain('Pendiente');
  });

  it('en proceso dice quién lo inició', async () => {
    await service.sendInProgress({
      user: recipient,
      startedBy: buildUser({ name: 'Ana Supervisora' }),
      evidenceCurrent: evidence({ startProcessDate: new Date() }),
    });
    const html = await render(sendMail.mock.calls[0][0]);

    expect(html).toContain('Ana Supervisora');
    expect(html).toContain('comenzó a atender este hallazgo');
  });

  it('la cancelación cierra el seguimiento con "Cancelado"', async () => {
    await service.sendCancel({
      cancelledBy: actor,
      user: recipient,
      evidenceCurrent: evidence(),
    });
    const html = await render(sendMail.mock.calls[0][0]);

    expect(html).toContain('Cancelado');
    expect(html).not.toContain('Pendiente');
  });

  it('restablecer contraseña: botón y enlace con el token', async () => {
    await service.sendForgotPassword('ana@hallazgos.test', 'tok123');
    const mail: SentMail = sendMail.mock.calls[0][0];
    const html = await render(mail);

    expect(html).toContain('href="https://ui.test/restore?token=tok123"');
    expect(html).toContain('Restablecer contraseña');
    expect(html).toContain('5 minutos');
    expect(cids(html)).toEqual(['logoComportarte', 'logoHada']);
    // El CSS en línea no quita las media queries (en celular se apilan).
    expect(html).toContain('@media only screen and (max-width: 620px)');
  });
});
