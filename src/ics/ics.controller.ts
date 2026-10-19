import { FileInterceptor } from '@nestjs/platform-express';
import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';

import { diskStorage } from 'multer';

import { CreateIcsDto, FiltersIcsDto, UpdateIcsDto } from './dto';
import { IcsService } from './ics.service';

@Controller('ics')
export class IcsController {
  constructor(private readonly icsService: IcsService) {}

  @Post()
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: './public/static/images/evidences',
        filename(req, file, callback) {
          req;
          callback(null, file.originalname);
        },
      }),
      limits: {
        fileSize: 2097152, //2 Megabytes
      },
    }),
  )
  create(
    @Body() createIcsDto: CreateIcsDto,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.icsService.create(createIcsDto, file);
  }

  @Get()
  findAll(@Query() filtersIcsDto: FiltersIcsDto) {
    return this.icsService.findAll(filtersIcsDto);
  }

  @Get('catalogs')
  catalogs() {
    return this.icsService.catalogs();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.icsService.findOne(+id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateIcsDto: UpdateIcsDto) {
    return this.icsService.update(+id, updateIcsDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.icsService.remove(+id);
  }
}
