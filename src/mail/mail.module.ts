import { MailOutboxService } from './outbox/mail-outbox.service.js';
import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MailerModule } from '@nestjs-modules/mailer';

import { MailService } from './mail.service.js';
import { mailTemplateConfig } from './mail.templates.js';

@Global()
@Module({
  imports: [
    MailerModule.forRootAsync({
      useFactory: async (configService: ConfigService) => {
        configService;
        return {
          transport: {
            host: configService.get('MAIL_HOST'),
            port: Number(configService.get('MAIL_PORT') || 587),
            connectionTimeout: 15000,
            greetingTimeout: 15000,
            socketTimeout: 60000,
            secure: false,
            requireTLS: configService.get('NODE_ENV') === 'production',
            auth: {
              user: configService.get('MAIL_USER'),
              pass: configService.get('MAIL_PASSWORD'),
            },
            tls: {
              rejectUnauthorized:
                configService.get('NODE_ENV') !== 'development',
            },
          },
          /*transport: { // Gmail
            host: configService.get('MAIL_HOST'),
            secure: false,
            auth: {
              user: configService.get('MAIL_USER'),
              pass: configService.get('MAIL_PASSWORD'),
            },
          },*/ // Gmail
          /*defaults: {
            from: `Hallazgos App`,
          },*/
          ...mailTemplateConfig(),
        };
      },
      inject: [ConfigService],
    }),
  ],
  providers: [MailService, MailOutboxService],
  exports: [MailService, MailOutboxService],
})
export class MailModule {}
