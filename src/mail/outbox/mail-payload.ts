import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  randomUUID,
  createHash,
} from 'node:crypto';
import {
  mkdir,
  writeFile,
  link,
  unlink,
  readFile,
  readdir,
} from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import Handlebars from 'handlebars';
import type { ISendMailOptions } from '@nestjs-modules/mailer';
import { MAIL_TEMPLATES_DIR } from '../mail.templates.js';

export const RESET_TOKEN_PLACEHOLDER = '__COMPORTARTE_RESET_TOKEN__';

export function encryptionKey(secret: string): Buffer {
  if (!secret)
    throw new Error('MAIL_OUTBOX_KEY is required for persistent mail');
  return createHash('sha256').update(`comportarte-mail-v1:${secret}`).digest();
}
export function seal(value: unknown, key: Buffer): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const body = Buffer.concat([
    cipher.update(JSON.stringify(value), 'utf8'),
    cipher.final(),
  ]);
  return [iv, cipher.getAuthTag(), body]
    .map((x) => x.toString('base64'))
    .join('.');
}
export function unseal<T>(value: string, key: Buffer): T {
  const [iv, tag, body] = value.split('.').map((x) => Buffer.from(x, 'base64'));
  const cipher = createDecipheriv('aes-256-gcm', key, iv);
  cipher.setAuthTag(tag);
  return JSON.parse(
    Buffer.concat([cipher.update(body), cipher.final()]).toString('utf8'),
  );
}

/** Freeze HTML and copy attachments before committing: future edits/deletes cannot change an event. */
export async function freezeMail(
  options: ISendMailOptions,
  directory: string,
): Promise<ISendMailOptions> {
  const engine = Handlebars.create();
  for (const name of await readdir(join(MAIL_TEMPLATES_DIR, 'partials'))) {
    if (name.endsWith('.hbs'))
      engine.registerPartial(
        basename(name, '.hbs'),
        await readFile(join(MAIL_TEMPLATES_DIR, 'partials', name), 'utf8'),
      );
  }
  const template = basename(String(options.template)).replace(/\.hbs$/, '');
  const source = await readFile(
    join(MAIL_TEMPLATES_DIR, template + '.hbs'),
    'utf8',
  );
  const html = engine.compile(source, { strict: true })(options.context);
  const attachments = [];
  const root = resolve(directory);
  await mkdir(root, { recursive: true, mode: 0o700 });
  for (const attachment of (options.attachments ?? []) as {
    path: string;
    filename: string;
    cid: string;
  }[]) {
    const data = await readFile(attachment.path);
    const path = join(root, createHash('sha256').update(data).digest('hex'));
    const temporary = join(root, randomUUID() + '.tmp');
    await writeFile(temporary, data, { mode: 0o600 });
    try {
      await link(temporary, path);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    } finally {
      await unlink(temporary);
    }
    attachments.push({
      filename: attachment.filename,
      cid: attachment.cid,
      path,
    });
  }
  return {
    to: options.to,
    from: options.from,
    subject: options.subject,
    html,
    attachments,
    headers: options.headers,
  };
}
