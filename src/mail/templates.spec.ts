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

  it('solution dice quién inició y quién cerró, con la fecha de inicio', () => {
    const html = render('solution', {
      startedBy: 'Ana Supervisora',
      startProcessDate: '1 de octubre de 2026 9:00',
      closedBy: 'Luis Responsable',
    });

    expect(html).toContain('<strong>Iniciado por:</strong>');
    expect(html).toContain('Ana Supervisora');
    expect(html).toContain('<strong>Fecha de inicio de proceso:</strong>');
    expect(html).toContain('1 de octubre de 2026 9:00');
    expect(html).toContain('<strong>Cerrado por:</strong>');
    expect(html).toContain('Luis Responsable');
  });

  it('solution sin ese dato (hallazgos anteriores) no muestra las filas', () => {
    const html = render('solution', { startedBy: '', closedBy: '' });

    expect(html).not.toContain('Iniciado por');
    expect(html).not.toContain('Cerrado por');
    expect(html).not.toContain('Fecha de inicio de proceso');
  });

  it('in-progress dice quién lo inició', () => {
    const html = render('in-progress', { startedBy: 'Ana Supervisora' });

    expect(html).toContain('<strong>Iniciado por:</strong>');
    expect(html).toContain('Ana Supervisora');
    expect(html).not.toContain('Actualizado por');
  });

  it('sin descripción no muestra la etiqueta', () => {
    expect(render('create', {})).not.toContain('Lo que se observó');
  });
});
