import { z } from 'zod';

export const countryCodeSchema = z
  .string()
  .trim()
  .length(2)
  .regex(/^[A-Za-z]{2}$/)
  .transform((value) => value.toUpperCase());
