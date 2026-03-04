import { Module } from '@nestjs/common';

import { ConfigEppController } from './config-epp.controller';
import { ConfigEppService } from './config-epp.service';

@Module({
  controllers: [ConfigEppController],
  providers: [ConfigEppService],
  exports: [ConfigEppService],
})
export class ConfigEppModule {}
