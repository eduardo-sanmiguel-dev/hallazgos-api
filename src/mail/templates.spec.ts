import { readFileSync } from 'fs';
import { join } from 'path';

import Handlebars from 'handlebars';

// Etiquetas neutras: la descripción ya no depende de la clasificación
// (antes decía "Descripción del comportamiento inseguro" en todos los avisos).
const render = (template: string, context: Record<string, unknown>) =>
  Handlebars.compile(
    readFileSync(join(__dirname, 'templates', `${template}.hbs`), 'utf8'),
  )(context);

describe('Plantillas de correo de hallazgos', () => {
  it.each(['create', 'in-progress', 'solution', 'cancel', 'reassign'])(
    '%s muestra la descripción como "Lo que se observó"',
    (template) => {
      const html = render(template, { descripcion: 'Derrame en pasillo' });

      expect(html).toContain('<strong>Lo que se observó:</strong>');
      expect(html).toContain('Derrame en pasillo');
      expect(html).not.toMatch(/comportamiento\s+inseguro/i);
    },
  );

  it('solution muestra la solución como "Cómo se resolvió"', () => {
    const html = render('solution', {
      descripcion: 'Derrame en pasillo',
      descripcionSolucion: 'Se limpió',
    });

    expect(html).toContain('<strong>Cómo se resolvió:</strong>');
    expect(html).toContain('Se limpió');
  });

  it('sin descripción no muestra la etiqueta', () => {
    expect(render('create', {})).not.toContain('Lo que se observó');
  });
});
