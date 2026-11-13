import { ConfigService } from '@nestjs/config';
import type { ISendMailOptions } from '@nestjs-modules/mailer';
import { MailerService } from '@nestjs-modules/mailer';
import { mkdtemp, readdir, rm, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MailService } from '../mail.service.js';
import { freezeMail } from './mail-payload.js';

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
});
