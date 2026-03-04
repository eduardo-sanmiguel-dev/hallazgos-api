import { Injectable } from '@nestjs/common';

import { CreateConfigEppDto, UpdateConfigEppDto } from './dto';

@Injectable()
export class ConfigEppService {
  create(createConfigEppDto: CreateConfigEppDto) {
    return createConfigEppDto;
  }

  findAll() {
    return `This action returns all configEpp`;
  }

  findOne(id: number) {
    return `This action returns a #${id} configEpp`;
  }

  update(id: number, updateConfigEppDto: UpdateConfigEppDto) {
    return { id, updateConfigEppDto };
  }

  remove(id: number) {
    return `This action removes a #${id} configEpp`;
  }
}
