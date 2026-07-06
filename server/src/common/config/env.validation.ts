import * as Joi from 'joi';

// Validated at boot by @nestjs/config. Boot fails fast if anything is missing.
export const envValidationSchema = Joi.object({
  NODE_ENV: Joi.string().valid('development', 'test', 'production').default('development'),
  PORT: Joi.number().default(4000),

  DATABASE_URL: Joi.string().required(),
  REDIS_URL: Joi.string().default('redis://localhost:6379'),

  JWT_ACCESS_SECRET: Joi.string().min(16).required(),
  JWT_REFRESH_SECRET: Joi.string().min(16).required(),
  JWT_ACCESS_TTL: Joi.number().default(900),
  JWT_REFRESH_TTL: Joi.number().default(1209600),

  COOKIE_DOMAIN: Joi.string().default('localhost'),
  COOKIE_SECURE: Joi.boolean().default(false),
  CORS_ORIGIN: Joi.string().default('http://localhost:5173'),

  APP_NAME: Joi.string().default('CRM'),
  DEFAULT_CURRENCY: Joi.string().default('INR'),
  DEFAULT_TIMEZONE: Joi.string().default('Asia/Kolkata'),
}).unknown(true);
