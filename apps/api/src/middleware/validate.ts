import type { RequestHandler } from 'express';
import type { ZodTypeAny } from 'zod';

type ValidationTargets = {
  body?: ZodTypeAny;
  query?: ZodTypeAny;
  params?: ZodTypeAny;
};

function replaceReadonly(req: object, key: 'query' | 'params', value: unknown) {
  Object.defineProperty(req, key, {
    configurable: true,
    enumerable: true,
    writable: true,
    value,
  });
}

export function validate(schemas: ValidationTargets): RequestHandler {
  return (req, _res, next) => {
    try {
      if (schemas.body) {
        req.body = schemas.body.parse(req.body);
      }
      if (schemas.query) {
        replaceReadonly(req, 'query', schemas.query.parse(req.query));
      }
      if (schemas.params) {
        replaceReadonly(req, 'params', schemas.params.parse(req.params));
      }
      next();
    } catch (err) {
      next(err);
    }
  };
}
