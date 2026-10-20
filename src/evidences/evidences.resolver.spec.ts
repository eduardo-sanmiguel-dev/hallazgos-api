import { mockProvider } from '@test/utils';
import { Test } from '@nestjs/testing';

import { EvidencesResolver } from './evidences.resolver';
import { EvidencesService } from './evidences.service';
import { ParamsArgs } from './inputs/args';

describe('EvidencesResolver', () => {
  it('consulta la lista con los argumentos y el usuario del contexto (id numérico)', async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [EvidencesResolver, mockProvider(EvidencesService)],
    }).compile();
    const resolver = moduleRef.get(EvidencesResolver);
    const service = moduleRef.get(
      EvidencesService,
    ) as jest.Mocked<EvidencesService>;
    service.findAllGraphql.mockResolvedValue({ data: [], count: 0 });
    const args = Object.assign(new ParamsArgs(), { page: 1, limit: 10 });

    await expect(resolver.findAll(args, { userId: '7' })).resolves.toEqual({
      data: [],
      count: 0,
    });
    expect(service.findAllGraphql).toHaveBeenCalledWith(args, 7);
  });
});
