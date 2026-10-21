import { Field, Int, ObjectType } from '@nestjs/graphql';
import { Evidence } from '../entities/evidence.entity.js';

@ObjectType()
export class AggregationsEvidenceType {
  @Field(() => Int)
  count: number;

  @Field(() => [Evidence])
  data: Evidence[];
}
