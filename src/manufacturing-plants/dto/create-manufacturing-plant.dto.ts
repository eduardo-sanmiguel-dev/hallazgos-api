import {
  IsLatitude,
  IsLongitude,
  IsNotEmpty,
  IsNumber,
  IsString,
  IsUrl,
} from 'class-validator';

export class CreateManufacturingPlantDto {
  @IsNotEmpty()
  @IsString()
  name: string;

  // Solo http(s): la UI lo pone en un enlace; otro esquema (p. ej.
  // `javascript:`) sería un XSS al hacer clic. Antes aceptaba también ftp.
  @IsNotEmpty()
  @IsUrl({ protocols: ['http', 'https'] })
  link: string;

  // Antes se validaba como longitud (±180) y aceptaba latitudes imposibles.
  @IsNotEmpty()
  @IsNumber()
  @IsLatitude()
  lat: number;

  @IsNotEmpty()
  @IsNumber()
  @IsLongitude()
  lng: number;
}
