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

/**
 * Enlace de baja en el HTML. Es igual para todos los destinatarios, así que la
 * plantilla se sigue renderizando una vez por aviso; al congelar el correo se
 * cambia por la URL de cada uno, que viaja en la cabecera List-Unsubscribe.
 */
export const UNSUBSCRIBE_URL_PLACEHOLDER = '__COMPORTARTE_UNSUBSCRIBE_URL__';

const escapeHtml = (value: string) =>
  value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

/** HTML con la URL de baja de la cabecera `List-Unsubscribe: <url>`. */
export function withUnsubscribeUrl(
  html: string,
  headers: ISendMailOptions['headers'],
): string {
  const value = (headers as Record<string, unknown> | undefined)?.[
    'List-Unsubscribe'
  ];
  const url = /^<(https?:\/\/[^>\s]+)>$/.exec(String(value ?? ''))?.[1];
  return url
    ? html.split(UNSUBSCRIBE_URL_PLACEHOLDER).join(escapeHtml(url))
    : html;
}

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

type Template = (context: unknown) => string;

// Plantillas compiladas por proceso: los .hbs solo cambian con un deploy.
// Antes se leían y compilaban por cada destinatario (~8 ms c/u en el VPS: una
// reasignación con 44 destinatarios tardaba 1.7 s). En desarrollo no se
// cachean: watchAssets copia los .hbs editados sin reiniciar el proceso.
const templates = new Map<string, Promise<Template>>();

async function loadTemplate(template: string): Promise<Template> {
  const engine = Handlebars.create();
  for (const name of await readdir(join(MAIL_TEMPLATES_DIR, 'partials'))) {
    if (name.endsWith('.hbs'))
      engine.registerPartial(
        basename(name, '.hbs'),
        await readFile(join(MAIL_TEMPLATES_DIR, 'partials', name), 'utf8'),
      );
  }
  const source = await readFile(
    join(MAIL_TEMPLATES_DIR, template + '.hbs'),
    'utf8',
  );
  return engine.compile(source, { strict: true });
}

function compiledTemplate(template: string): Promise<Template> {
  if (process.env.NODE_ENV === 'development') return loadTemplate(template);
  let compiled = templates.get(template);
  if (compiled === undefined) {
    compiled = loadTemplate(template);
    // Un fallo (p. ej. plantilla inexistente) no se queda en caché.
    compiled.catch(() => templates.delete(template));
    templates.set(template, compiled);
  }
  return compiled;
}

/** Copia inmutable (por contenido) de un adjunto; devuelve su ruta. */
async function freezeAttachment(source: string, root: string) {
  const data = await readFile(source);
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
  return path;
}

/** HTML de una plantilla con su contexto; si ya está en `rendered`, lo reutiliza. */
async function renderMail(
  template: string,
  context: unknown,
  rendered?: Map<string, Promise<string>>,
): Promise<string> {
  const render = async () => (await compiledTemplate(template))(context);
  if (!rendered) return render();
  // La clave incluye el contexto completo: si algo cambia entre destinatarios
  // (p. ej. el día de "restan N días"), se renderiza de nuevo.
  const key = `${template}\0${JSON.stringify(context)}`;
  let html = rendered.get(key);
  if (html === undefined) {
    html = render();
    rendered.set(key, html);
  }
  return html;
}

/**
 * Freeze HTML and copy attachments before committing: future edits/deletes cannot change an event.
 * `frozen` (por evento) reutiliza los adjuntos ya copiados para los demás
 * destinatarios del mismo aviso, en vez de leer, hashear y copiar cada foto
 * otra vez (~9 ms por destinatario en el VPS). `rendered` (por evento) hace
 * lo mismo con el HTML: todos los destinatarios de un aviso reciben el mismo
 * contexto, así que la plantilla se renderiza una vez y no una por cada uno.
 */
export async function freezeMail(
  options: ISendMailOptions,
  directory: string,
  frozen?: Map<string, Promise<string>>,
  rendered?: Map<string, Promise<string>>,
): Promise<ISendMailOptions> {
  const template = basename(String(options.template)).replace(/\.hbs$/, '');
  const html = withUnsubscribeUrl(
    await renderMail(template, options.context, rendered),
    options.headers,
  );
  const attachments = [];
  const root = resolve(directory);
  await mkdir(root, { recursive: true, mode: 0o700 });
  for (const attachment of (options.attachments ?? []) as {
    path: string;
    filename: string;
    cid: string;
  }[]) {
    const key = `${root}\0${attachment.path}`;
    let path = frozen?.get(key);
    if (path === undefined) {
      path = freezeAttachment(attachment.path, root);
      frozen?.set(key, path);
    }
    attachments.push({
      filename: attachment.filename,
      cid: attachment.cid,
      path: await path,
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
