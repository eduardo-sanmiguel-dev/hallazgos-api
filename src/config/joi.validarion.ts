import Joi from 'joi';

export const JoiValidationSchema = Joi.object({
  NODE_ENV: Joi.string().required(),
  PORT: Joi.number().required(),
  APP_KEY: Joi.string().required(),
  WHITE_LIST_DOMAINS: Joi.string().required(),
  JWT_SECRET_KEY: Joi.string().required(),
  DB_HOST: Joi.string().required(),
  DB_USERNAME: Joi.string().required(),
  DB_PASSWORD: Joi.string().required(),
  DB_NAME: Joi.string().required(),
  DB_PORT: Joi.number().required(),
  // Pool de la API (opcionales; ver config/db-pool.config.ts).
  DB_POOL_MAX: Joi.number().integer().min(1).optional(),
  DB_POOL_MIN: Joi.number().integer().min(0).optional(),
  DB_POOL_IDLE_MS: Joi.number().integer().min(0).optional(),
  FRONTEND_URL: Joi.string().uri().required(),
  MAIL_OUTBOX_KEY: Joi.string()
    .min(32)
    .when('NODE_ENV', {
      is: 'production',
      then: Joi.required(),
      otherwise: Joi.optional(),
    }),
  MAIL_REDIS_URL: Joi.string()
    .uri({ scheme: ['redis', 'rediss'] })
    .optional(),
  MAIL_OUTBOX_DIR: Joi.string().optional(),
  MAIL_HOST: Joi.string().required(),
  MAIL_USER: Joi.string().email().required(),
  MAIL_PASSWORD: Joi.string().required(),
  GIST_SECRET_URL: Joi.string().uri().required(),
  OBSERVE_ENDPOINT: Joi.string().uri().optional(),
  OBSERVE_AUTH_HEADER: Joi.string().optional(),
  OBSERVE_STREAM: Joi.string().optional(),
  // Usuario de pruebas e2e del UI: solo se usa en desarrollo.
  // (el servicio valida el formato y solo avisa; nunca impide arrancar).
  E2E_EMAIL: Joi.string().optional(),
  E2E_PASSWORD: Joi.string().optional(),
});
