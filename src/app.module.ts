import {
  MiddlewareConsumer,
  Module,
  NestModule,
  RequestMethod,
} from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { TypeOrmModule } from '@nestjs/typeorm';
import { GraphQLModule } from '@nestjs/graphql';
import { ApolloDriver, ApolloDriverConfig } from '@nestjs/apollo';
import { ServeStaticModule } from '@nestjs/serve-static';
import { join } from 'path';

import { EnvConfiguration, JoiValidationSchema } from '@config';

import {
  AppKeyMiddleware,
  JwtMiddleware,
  RequestContextMiddleware,
} from '@shared/middlewares';
import { RequestContextModule } from './shared/services/request-context.module';
import { DeleteUploadsOnErrorInterceptor } from './shared/interceptors';
import { GistSecretGuardService } from './shared/services/gist-secret-guard.service';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { ManufacturingPlantsModule } from './manufacturing-plants/manufacturing-plants.module';
import { EvidencesModule } from './evidences/evidences.module';
import { ZonesModule } from './zones/zones.module';
import { MainTypesModule } from './main-types/main-types.module';
import { SecondaryTypesModule } from './secondary-types/secondary-types.module';
import { MailModule } from './mail/mail.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { JwtService } from 'auth/jwt.service';
import { ProcessesModule } from 'processes/processes.module';
import { EppsModule } from './epps/epps.module';
import { EmployeesModule } from './employees/employees.module';
import { EquipmentsModule } from './equipments/equipments.module';
import { AreasModule } from './areas/areas.module';
import { TypesOfEventsModule } from './types-of-events/types-of-events.module';
import { GenresModule } from './genres/genres.module';
import { CieDiagnosesModule } from './cie-diagnoses/cie-diagnoses.module';
import { AccidentPositionsModule } from './accident-positions/accident-positions.module';
import { BodyPartsModule } from './body-parts/body-parts.module';
import { AtAgentsModule } from './at-agents/at-agents.module';
import { TypeOfInjuriesModule } from './type-of-injuries/type-of-injuries.module';
import { AtMechanismsModule } from './at-mechanisms/at-mechanisms.module';
import { WorkingDaysModule } from './working-days/working-days.module';
import { TypeOfLinksModule } from './type-of-links/type-of-links.module';
import { MachinesModule } from './machines/machines.module';
import { AssociatedTasksModule } from './associated-tasks/associated-tasks.module';
import { RiskFactorsModule } from './risk-factors/risk-factors.module';
import { NatureOfEventsModule } from './nature-of-events/nature-of-events.module';
import { CountriesModule } from './countries/countries.module';
import { CiaelsModule } from './ciaels/ciaels.module';
import { RulesOfLifeModule } from 'rules-of-life/rules-of-life.module';
import { IcsModule } from './ics/ics.module';
import { SafetyDataFilesModule } from './safety-data-files/safety-data-files.module';
import { EmergencyTeamsModule } from './emergency-teams/emergency-teams.module';
import { ExtinguisherInspectionsModule } from './extinguisher-inspections/extinguisher-inspections.module';
import { GembaWalkZonesModule } from './gemba-walk-zones/gemba-walk-zones.module';
import { GembaWalkObserversModule } from './gemba-walk-observers/gemba-walk-observers.module';
import { GembaWalkCalendarModule } from './gemba-walk-calendar/gemba-walk-calendar.module';
import { GembaWalkEvaluationsModule } from './gemba-walk-evaluations/gemba-walk-evaluations.module';
import { GembaWalksModule } from './gemba-walks/gemba-walks.module';
import { HealthModule } from './health/health.module';
import { ObserveIntegrationModule } from 'observe.module';

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
        migrations: [join(__dirname, 'migrations', '*{.ts,.js}')],
      }),
    }),
    GraphQLModule.forRootAsync<ApolloDriverConfig>({
      driver: ApolloDriver,
      imports: [ConfigModule, AuthModule],
      inject: [ConfigService, JwtService],
      useFactory: async (
        configService: ConfigService,
        jwtService: JwtService,
      ) => ({
        // En pruebas (NODE_ENV=test) el esquema se genera en memoria para no
        // reescribir src/schema.gql en cada corrida.
        autoSchemaFile:
          configService.get<string>('environment') === 'test'
            ? true
            : join(process.cwd(), 'src/schema.gql'),
        introspection:
          configService.get<string>('environment') !== 'production',
        async context({ req }) {
          const appKey = configService.get<string>('appKey');

          const appKeyHeader = req.headers['x-app-key'];

          if (!appKeyHeader) {
            throw Error('API Key es requerido');
          }

          if (appKeyHeader !== appKey) {
            throw Error('API Key es inválido');
          }

          let token = '';

          token = req.cookies['token'] ? `${req.cookies['token']}` : '';

          if (!token) {
            token = `${req.headers['authorization']}`.split('Bearer ')[1] || '';
          }

          if (!token) {
            throw Error('Token no encontrado');
          }

          try {
            const { userId } = await jwtService.verify(token);
            return { user: { userId } };
          } catch {
            throw Error('Credenciales no válidas');
          }
        },
      }),
    }),
    ServeStaticModule.forRoot({
      rootPath: join(__dirname, '..', 'public'),
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
    RequestContextModule,
    ObserveIntegrationModule,
  ],
  controllers: [],
  providers: [
    JwtService,
    GistSecretGuardService,
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
        healthRoute,
      )
      .forRoutes('/');
  }
}
