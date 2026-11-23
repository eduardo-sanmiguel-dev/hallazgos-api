import { MailPreferencesController } from './mail-preferences.controller.js';
import { MailPreferencesService } from './mail-preferences.service.js';

describe('MailPreferencesController', () => {
  // Se instancia directo: el ThrottlerGuard y que las rutas sean públicas lo
  // cubre el e2e.
  const preferences = { email: 'p••••@x.com', plantNotifications: false };
  const service = {
    find: jest.fn().mockResolvedValue(preferences),
    update: jest.fn().mockResolvedValue(preferences),
  };
  const controller = new MailPreferencesController(
    service as unknown as MailPreferencesService,
  );

  it('lookup consulta con el token', async () => {
    await expect(controller.find({ unsubscribeToken: 't' })).resolves.toBe(
      preferences,
    );
    expect(service.find).toHaveBeenCalledWith('t');
  });

  it('update cambia la casilla con el token', async () => {
    await expect(
      controller.update({ unsubscribeToken: 't', plantNotifications: false }),
    ).resolves.toBe(preferences);
    expect(service.update).toHaveBeenCalledWith('t', false);
  });
});
