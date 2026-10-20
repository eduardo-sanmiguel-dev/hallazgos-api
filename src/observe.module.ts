import { Module } from '@nestjs/common';

function createObserveImports() {
  if (process.env.NODE_ENV !== 'production') {
    return [];
  }

  const { createObserveModule } = require('@nestjs/observe');
  const { ObserveModule } = createObserveModule();

  return [
    ObserveModule.forRoot({
      appKey: process.env.OBSERVE_AUTH_HEADER, // usa el encabezado completo
      serviceId: 'api-comportarte',
      endpoint: process.env.OBSERVE_ENDPOINT,
    }),
  ];
}

@Module({
  imports: createObserveImports(),
})
export class ObserveIntegrationModule {}
