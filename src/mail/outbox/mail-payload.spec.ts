import { ConfigService } from '@nestjs/config';
import type { ISendMailOptions } from '@nestjs-modules/mailer';
import { MailerService } from '@nestjs-modules/mailer';
import fsPromises, {
  mkdtemp,
  readdir,
  rm,
  unlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildEvidence, buildUser } from '../../../test/utils/index.js';
import { MailService } from '../mail.service.js';
import {
  UNSUBSCRIBE_URL_PLACEHOLDER,
  freezeMail,
  withUnsubscribeUrl,
} from './mail-payload.js';

// Una reasignación con 44 destinatarios tardaba 1.7 s: por cada uno se
// compilaba la plantilla y se leía, hasheaba y copiaba cada foto. Ahora la
// plantilla se compila una vez por proceso y los adjuntos una vez por evento.

describe('freezeMail', () => {
  let directory: string;
  let blobs: string;
  let options: ISendMailOptions;

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'mail-payload-'));
    blobs = join(directory, 'blobs');
    // Opciones reales (contexto completo para la plantilla estricta).
    const sendMail = jest.fn();
    const config = new ConfigService({
      email: { user: 'sender@test.com' },
      environment: 'production',
    });
    await new MailService(
      { sendMail } as unknown as MailerService,
      config,
    ).sendForgotPassword('person@test.com', 'token');
    const photo = join(directory, 'photo.png');
    await writeFile(photo, 'foto');
    options = {
      ...sendMail.mock.calls[0][0],
      attachments: [{ filename: 'photo.png', path: photo, cid: 'imgEvidence' }],
    };
  });

  afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  const source = () =>
    (options.attachments as { path: string }[])[0].path as string;

  it('renderiza igual en llamadas sucesivas (plantilla en caché)', async () => {
    const first = await freezeMail(options, blobs);
    const second = await freezeMail(options, blobs);

    expect(first.html).toContain('Restablece tu contraseña');
    expect(second.html).toBe(first.html);
  });

  it('reutiliza los adjuntos ya congelados del mismo evento', async () => {
    const frozen = new Map<string, Promise<string>>();
    const first = await freezeMail(options, blobs, frozen);
    // Si volviera a leer el archivo fallaría: ya no existe.
    await unlink(source());
    const second = await freezeMail(options, blobs, frozen);

    expect(second.attachments).toEqual(first.attachments);
    expect(await readdir(blobs)).toHaveLength(1);
  });

  // Todos los destinatarios de un aviso reciben el mismo contexto: el HTML se
  // renderiza una vez por evento y no una por destinatario.
  it('reutiliza el HTML ya renderizado del mismo evento', async () => {
    const rendered = new Map<string, Promise<string>>();
    const first = await freezeMail(options, blobs, undefined, rendered);
    // Otro objeto con el mismo contenido (como lo arma MailService por cada
    // destinatario) usa la misma entrada.
    const second = await freezeMail(
      { ...options, context: structuredClone(options.context) },
      blobs,
      undefined,
      rendered,
    );

    expect(second.html).toBe(first.html);
    expect(rendered.size).toBe(1);
  });

  it('si el contexto cambia, renderiza de nuevo en vez de reutilizar el HTML', async () => {
    const rendered = new Map<string, Promise<string>>();
    const first = await freezeMail(options, blobs, undefined, rendered);
    const changed = await freezeMail(
      { ...options, context: { ...options.context, title: 'Otro título' } },
      blobs,
      undefined,
      rendered,
    );

    expect(first.html).toContain('Restablece tu contraseña');
    expect(changed.html).toContain('Otro título');
    expect(changed.html).not.toContain('Restablece tu contraseña');
    expect(rendered.size).toBe(2);
  });

  it('el HTML de una plantilla no se reutiliza para otra con el mismo contexto', async () => {
    const rendered = new Map<string, Promise<string>>();
    await freezeMail(options, blobs, undefined, rendered);

    await expect(
      freezeMail(
        { ...options, template: './no-existe' },
        blobs,
        undefined,
        rendered,
      ),
    ).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('sin caché de evento, cada llamada vuelve a copiar el adjunto', async () => {
    await freezeMail(options, blobs);
    await unlink(source());

    await expect(freezeMail(options, blobs)).rejects.toMatchObject({
      code: 'ENOENT',
    });
  });

  it('una plantilla inexistente falla y no queda en caché', async () => {
    const missing = { ...options, template: './no-existe' };

    await expect(freezeMail(missing, blobs)).rejects.toMatchObject({
      code: 'ENOENT',
    });
    await expect(freezeMail(missing, blobs)).rejects.toMatchObject({
      code: 'ENOENT',
    });
  });

  it('sin adjuntos solo renderiza el HTML', async () => {
    const { attachments: _omit, ...withoutAttachments } = options;

    const frozen = await freezeMail(withoutAttachments, blobs);

    expect(frozen.attachments).toEqual([]);
    expect(frozen.html).toEqual(expect.any(String));
  });

  it('en desarrollo recompila la plantilla e ignora archivos que no son .hbs', async () => {
    const previous = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';
    const real = fsPromises.readdir.bind(fsPromises);
    const listing = jest
      .spyOn(fsPromises, 'readdir')
      .mockImplementation((async (path: string) =>
        String(path).endsWith('partials')
          ? [...(await real(path)), 'LEEME.txt']
          : real(path)) as never);
    try {
      const frozen = await freezeMail(options, blobs);

      expect(frozen.html).toEqual(expect.any(String));
      expect(listing).toHaveBeenCalled();
    } finally {
      listing.mockRestore();
      process.env.NODE_ENV = previous;
    }
  });

  it('un error al enlazar el adjunto (distinto de "ya existe") se propaga', async () => {
    const failure = jest
      .spyOn(fsPromises, 'link')
      .mockRejectedValue(Object.assign(new Error('EPERM'), { code: 'EPERM' }));
    try {
      await expect(freezeMail(options, blobs)).rejects.toThrow('EPERM');
      // El temporal se borra igual.
      expect(
        (await readdir(blobs)).filter((name) => name.endsWith('.tmp')),
      ).toEqual([]);
    } finally {
      failure.mockRestore();
    }
  });
});

describe('Enlace de baja al congelar el correo', () => {
  const url = 'https://ui.test/unsubscribe?token=7.abc&x=1';
  const html = `<a href="${UNSUBSCRIBE_URL_PLACEHOLDER}">baja</a>`;

  it('cambia el marcador por la URL de List-Unsubscribe, escapada', () => {
    expect(withUnsubscribeUrl(html, { 'List-Unsubscribe': `<${url}>` })).toBe(
      '<a href="https://ui.test/unsubscribe?token=7.abc&amp;x=1">baja</a>',
    );
  });

  it.each([
    ['sin cabeceras', undefined],
    ['sin List-Unsubscribe', { 'X-Otra': '1' }],
    ['con un valor que no es <https://…>', { 'List-Unsubscribe': 'mailto:x' }],
  ])('%s deja el HTML igual', (_, headers) => {
    expect(withUnsubscribeUrl(html, headers)).toBe(html);
  });

  it('cada destinatario recibe su enlace aunque el HTML se renderice una vez', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'mail-unsubscribe-'));
    try {
      const sendMail = jest.fn();
      const service = new MailService(
        { sendMail } as unknown as MailerService,
        new ConfigService({
          email: { user: 'sender@test.com' },
          environment: 'production',
          frontendUrl: 'https://ui.test',
          jwt: { secretKey: 'secreto' },
        }),
      );
      const evidenceCurrent = buildEvidence({ id: 7, imgEvidence: '' });
      for (const id of [1, 2])
        await service.sendCreate({
          user: buildUser({ id, email: `u${id}@test.com` }),
          evidenceCurrent,
          plantWide: true,
        });
      const rendered = new Map<string, Promise<string>>();
      const [first, second] = await Promise.all(
        sendMail.mock.calls.map(([mail]) =>
          freezeMail(
            { ...mail, attachments: [] },
            join(directory, 'blobs'),
            undefined,
            rendered,
          ),
        ),
      );

      expect(rendered.size).toBe(1);
      expect(first.html).toContain('https://ui.test/unsubscribe?token=1.');
      expect(second.html).toContain('https://ui.test/unsubscribe?token=2.');
      expect(first.html).toContain('Dejar de recibir avisos de la planta');
      expect(first.html).not.toContain(UNSUBSCRIBE_URL_PLACEHOLDER);
      expect(first.headers).toEqual({
        'List-Unsubscribe': expect.stringMatching(
          /^<https:\/\/ui\.test\/unsubscribe\?token=1\.[\w-]{43}>$/,
        ),
      });
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
