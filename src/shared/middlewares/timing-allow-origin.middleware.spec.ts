import type { NextFunction, Request, Response } from 'express';

import { timingAllowOrigin } from './timing-allow-origin.middleware.js';

describe('timingAllowOrigin', () => {
  it('deja ver los tiempos de la API solo a la UI y sigue con la petición', () => {
    const res = { setHeader: jest.fn() } as unknown as Response & {
      setHeader: jest.Mock;
    };
    const next = jest.fn() as NextFunction;

    timingAllowOrigin('https://comportarte.com')({} as Request, res, next);

    expect(res.setHeader).toHaveBeenCalledWith(
      'Timing-Allow-Origin',
      'https://comportarte.com',
    );
    expect(next).toHaveBeenCalled();
  });
});
