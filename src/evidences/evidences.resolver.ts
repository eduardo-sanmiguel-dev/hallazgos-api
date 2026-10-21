import { Args, Context, Query, Resolver } from '@nestjs/graphql';

import { Evidence } from './entities/evidence.entity.js';
import { EvidencesService } from './evidences.service.js';
import { AggregationsEvidenceType } from './types/index.js';
import { ParamsArgs } from './inputs/args/index.js';

@Resolver(Evidence)
export class EvidencesResolver {
  constructor(private readonly evidencesService: EvidencesService) {}

  @Query(() => AggregationsEvidenceType, { name: 'evidences' })
  findAll(
    @Args() paramsArgs: ParamsArgs,
    @Context('user') { userId }: { userId: string },
  ): Promise<{
    data: Evidence[];
    count: number;
  }> {
    return this.evidencesService.findAllGraphql(paramsArgs, +userId);
  }
}
