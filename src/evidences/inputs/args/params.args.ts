import { ArgsType, Field, Int } from '@nestjs/graphql';

import {
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Matches,
} from 'class-validator';

@ArgsType()
export class ParamsArgs {
  @IsPositive()
  @Field(() => Int)
  page: number;

  @IsNumber()
  @Field(() => Int)
  limit: number;

  @IsOptional()
  @IsPositive()
  @Field(() => Number, { nullable: true })
  manufacturingPlantId?: number;

  @IsOptional()
  @IsPositive()
  @Field(() => Number, { nullable: true })
  mainTypeId?: number;

  @IsOptional()
  @IsPositive()
  @Field(() => Number, { nullable: true })
  secondaryTypeId?: number;

  @IsOptional()
  @IsPositive()
  @Field(() => Number, { nullable: true })
  zoneId?: number;

  @IsOptional()
  @IsPositive()
  @Field(() => Number, { nullable: true })
  processId?: number;

  @IsOptional()
  @IsString()
  @Field(() => String, { nullable: true })
  status?: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d{2}\/\d{2}\/\d{4}$/)
  @Field(() => String, { nullable: true })
  startDate?: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d{2}\/\d{2}\/\d{4}$/)
  @Field(() => String, { nullable: true })
  endDate?: string;
}
