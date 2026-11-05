import {
  Controller,
  Module,
  Param,
  ParseIntPipe,
  Patch,
  UseGuards,
} from '@nestjs/common';
import { AdminGuard } from '../shared/guards/admin.guard.js';
import { CatalogLifecycleService } from './catalog-lifecycle.service.js';
@Controller('catalogs')
@UseGuards(AdminGuard)
export class CatalogLifecycleController {
  constructor(private readonly service: CatalogLifecycleService) {}
  @Patch(':catalog/:id/activate')
  activate(
    @Param('catalog') catalog: string,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.service.activate(catalog, id);
  }
}
@Module({
  controllers: [CatalogLifecycleController],
  providers: [CatalogLifecycleService],
})
export class CatalogLifecycleModule {}
