import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { CreateManufacturingPlantDto } from './create-manufacturing-plant.dto.js';

const invalidFields = async (body: object) =>
  (
    await validate(plainToInstance(CreateManufacturingPlantDto, body), {
      whitelist: true,
      forbidNonWhitelisted: true,
    })
  ).map(({ property }) => property);

const plant = {
  name: 'Planta E2E',
  link: 'https://maps.google.com/?q=19.4,-99.1',
  lat: 19.4,
  lng: -99.1,
};

describe('CreateManufacturingPlantDto: enlace', () => {
  it.each([
    'https://maps.google.com/?q=19.4,-99.1',
    'http://example.com/mapa',
    'maps.google.com/?q=1,2',
  ])('acepta %s', async (link) => {
    await expect(invalidFields({ ...plant, link })).resolves.toEqual([]);
  });

  // La UI lo pone en un <a href>: otro esquema sería un XSS al hacer clic.
  it.each([
    'javascript:alert(document.cookie)',
    'data:text/html,<script>alert(1)</script>',
    'ftp://example.com/plano',
    'vbscript:msgbox(1)',
  ])('rechaza %s', async (link) => {
    await expect(invalidFields({ ...plant, link })).resolves.toEqual(['link']);
  });
});
