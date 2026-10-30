import {
  type MiddlewareConsumer,
  Module,
  type NestModule,
  RequestMethod,
} from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ServeStaticModule } from '@nestjs/serve-static';
import { join } from 'path';

import { EnvConfiguration, JoiValidationSchema } from './config/index.js';

import {
  AppKeyMiddleware,
  JwtMiddleware,
  RequestContextMiddleware,
} from './shared/middlewares/index.js';
import { RequestContextModule } from './shared/services/request-context.module.js';
import { DeleteUploadsOnErrorInterceptor } from './shared/interceptors/index.js';
import { GistSecretGuardService } from './shared/services/gist-secret-guard.service.js';
import { AuthModule } from './auth/auth.module.js';
import { UsersModule } from './users/users.module.js';
import { ManufacturingPlantsModule } from './manufacturing-plants/manufacturing-plants.module.js';
import { EvidencesModule } from './evidences/evidences.module.js';
import { ZonesModule } from './zones/zones.module.js';
import { MainTypesModule } from './main-types/main-types.module.js';
import { SecondaryTypesModule } from './secondary-types/secondary-types.module.js';
import { MailModule } from './mail/mail.module.js';
import { DashboardModule } from './dashboard/dashboard.module.js';
import { JwtService } from './auth/jwt.service.js';
import { ProcessesModule } from './processes/processes.module.js';
import { EppsModule } from './epps/epps.module.js';
import { EmployeesModule } from './employees/employees.module.js';
import { EquipmentsModule } from './equipments/equipments.module.js';
import { AreasModule } from './areas/areas.module.js';
import { TypesOfEventsModule } from './types-of-events/types-of-events.module.js';
import { GenresModule } from './genres/genres.module.js';
import { CieDiagnosesModule } from './cie-diagnoses/cie-diagnoses.module.js';
import { AccidentPositionsModule } from './accident-positions/accident-positions.module.js';
import { BodyPartsModule } from './body-parts/body-parts.module.js';
import { AtAgentsModule } from './at-agents/at-agents.module.js';
import { TypeOfInjuriesModule } from './type-of-injuries/type-of-injuries.module.js';
import { AtMechanismsModule } from './at-mechanisms/at-mechanisms.module.js';
import { WorkingDaysModule } from './working-days/working-days.module.js';
import { TypeOfLinksModule } from './type-of-links/type-of-links.module.js';
import { MachinesModule } from './machines/machines.module.js';
import { AssociatedTasksModule } from './associated-tasks/associated-tasks.module.js';
import { RiskFactorsModule } from './risk-factors/risk-factors.module.js';
import { NatureOfEventsModule } from './nature-of-events/nature-of-events.module.js';
import { CountriesModule } from './countries/countries.module.js';
import { CiaelsModule } from './ciaels/ciaels.module.js';
import { RulesOfLifeModule } from './rules-of-life/rules-of-life.module.js';
import { IcsModule } from './ics/ics.module.js';
import { SafetyDataFilesModule } from './safety-data-files/safety-data-files.module.js';
import { EmergencyTeamsModule } from './emergency-teams/emergency-teams.module.js';
import { ExtinguisherInspectionsModule } from './extinguisher-inspections/extinguisher-inspections.module.js';
import { GembaWalkZonesModule } from './gemba-walk-zones/gemba-walk-zones.module.js';
import { GembaWalkObserversModule } from './gemba-walk-observers/gemba-walk-observers.module.js';
import { GembaWalkCalendarModule } from './gemba-walk-calendar/gemba-walk-calendar.module.js';
import { GembaWalkEvaluationsModule } from './gemba-walk-evaluations/gemba-walk-evaluations.module.js';
import { GembaWalksModule } from './gemba-walks/gemba-walks.module.js';
import { HealthModule } from './health/health.module.js';
import { DeploymentUpdatesService } from './deployments/deployment-updates.service.js';
import { IdempotencyModule } from './idempotency/idempotency.module.js';
import { EvidenceImageAccessMiddleware } from './evidences/evidence-image-access.middleware.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: `.env.${process.env.NODE_ENV}`,
      load: [EnvConfiguration],
      validationSchema: JoiValidationSchema,
    }),
    ScheduleModule.forRoot(),
    // Conexión con la configuración ya validada por Joi (ConfigService).
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        type: 'postgres',
        host: configService.get<string>('db.host'),
        port: Number(configService.get<string>('db.port')),
        username: configService.get<string>('db.username'),
        password: configService.get<string>('db.password'),
        database: configService.get<string>('db.name'),
        autoLoadEntities: true,
        synchronize: false,
        migrationsRun: true,
        migrations: [join(import.meta.dirname, 'migrations', '*{.ts,.js}')],
      }),
    }),
    ServeStaticModule.forRoot({
      rootPath: join(import.meta.dirname, '..', 'public'),
    }),
    AuthModule,
    UsersModule,
    ManufacturingPlantsModule,
    EvidencesModule,
    ZonesModule,
    MainTypesModule,
    SecondaryTypesModule,
    MailModule,
    DashboardModule,
    ProcessesModule,
    EppsModule,
    EmployeesModule,
    EquipmentsModule,
    AreasModule,
    TypesOfEventsModule,
    GenresModule,
    CieDiagnosesModule,
    AccidentPositionsModule,
    BodyPartsModule,
    AtAgentsModule,
    TypeOfInjuriesModule,
    AtMechanismsModule,
    WorkingDaysModule,
    TypeOfLinksModule,
    MachinesModule,
    AssociatedTasksModule,
    RiskFactorsModule,
    NatureOfEventsModule,
    CountriesModule,
    CiaelsModule,
    RulesOfLifeModule,
    IcsModule,
    SafetyDataFilesModule,
    EmergencyTeamsModule,
    ExtinguisherInspectionsModule,
    GembaWalkZonesModule,
    GembaWalkObserversModule,
    GembaWalkCalendarModule,
    GembaWalkEvaluationsModule,
    GembaWalksModule,
    HealthModule,
    IdempotencyModule,
    RequestContextModule,
  ],
  controllers: [],
  providers: [
    DeploymentUpdatesService,
    JwtService,
    GistSecretGuardService,
    EvidenceImageAccessMiddleware,
    // Borra las imágenes subidas si la petición termina en error.
    { provide: APP_INTERCEPTOR, useClass: DeleteUploadsOnErrorInterceptor },
  ],
})
export class AppModule implements NestModule {
  public configure(consumer: MiddlewareConsumer): void {
    // /health es público (monitoreo): sin app key ni JWT.
    const healthRoute = { path: 'health', method: RequestMethod.GET };

    // Primero: abre el contexto de la petición que leen los servicios.
    consumer.apply(RequestContextMiddleware).forRoutes('/');
    consumer.apply(AppKeyMiddleware).exclude(healthRoute).forRoutes('/');
    consumer
      .apply(JwtMiddleware)
      .exclude(
        { path: 'auth/check-token', method: RequestMethod.POST },
        {
          path: 'auth/check-token-restore-password',
          method: RequestMethod.POST,
        },
        { path: 'auth/login', method: RequestMethod.POST },
        { path: 'auth/login-restore-password', method: RequestMethod.POST },
        { path: 'auth/forgot-password', method: RequestMethod.POST },
        // Solo borra la cookie: debe funcionar con la sesión ya terminada
        // (token vencido o usuario desactivado); si no, la UI no podría
        // limpiarla y "/" la devolvería al dashboard una y otra vez.
        { path: 'auth/logout', method: RequestMethod.POST },
        healthRoute,
      )
      .forRoutes('/');
  }
}
