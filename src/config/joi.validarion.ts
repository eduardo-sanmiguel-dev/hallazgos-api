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
  FRONTEND_URL: Joi.string().uri().required(),
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
