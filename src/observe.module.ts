import { Module } from '@nestjs/common';

const { createObserveModule } = require('@nestjs/observe');

const { ObserveModule } = createObserveModule();

@Module({
  imports: [
    ObserveModule.forRoot({
      appKey: process.env.OBSERVE_APP_KEY ?? 'YOUR_APP_KEY',
      appSecret: process.env.OBSERVE_APP_SECRET ?? 'YOUR_APP_SECRET',
      serviceId: 'api-comportarte',
      endpoint:
        process.env.OBSERVE_ENDPOINT ?? 'http://localhost:5080/api/default',
    }),
  ],
})
export class ObserveIntegrationModule {}
