import { join } from 'path';

import { HandlebarsAdapter } from '@nestjs-modules/mailer/adapters/handlebars.adapter';

// Plantillas Handlebars de los correos y sus partials (layout, indicadores,
// seguimiento, fotos, detalles). La usan el módulo y las pruebas de render.
export const MAIL_TEMPLATES_DIR = join(import.meta.dirname, 'templates');

// strict: un campo que falte en el contexto lanza en vez de quedar vacío.
const STRICT = { strict: true };

export const mailTemplateConfig = () => ({
  template: {
    dir: MAIL_TEMPLATES_DIR,
    adapter: new HandlebarsAdapter(),
    options: STRICT,
  },
  options: {
    partials: { dir: join(MAIL_TEMPLATES_DIR, 'partials'), options: STRICT },
  },
});
