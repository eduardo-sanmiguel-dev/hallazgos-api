import { ArgsType, Field, Int } from '@nestjs/graphql';

import {
  IsArray,
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
  @IsArray()
  @IsPositive({ each: true })
  @Field(() => [Int], { nullable: true })
  mainTypeIds?: number[];

  @IsOptional()
  @IsPositive()
  @Field(() => Number, { nullable: true })
  secondaryTypeId?: number;

  @IsOptional()
  @IsArray()
  @IsPositive({ each: true })
  @Field(() => [Int], { nullable: true })
  secondaryTypeIds?: number[];

  @IsOptional()
  @IsPositive()
  @Field(() => Number, { nullable: true })
  zoneId?: number;

  @IsOptional()
  @IsArray()
  @IsPositive({ each: true })
  @Field(() => [Int], { nullable: true })
  zoneIds?: number[];

  @IsOptional()
  @IsPositive()
  @Field(() => Number, { nullable: true })
  processId?: number;

  @IsOptional()
  @IsArray()
  @IsPositive({ each: true })
  @Field(() => [Int], { nullable: true })
  processIds?: number[];

  @IsOptional()
  @IsString()
  @Field(() => String, { nullable: true })
  status?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @Field(() => [String], { nullable: true })
  statuses?: string[];

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
