<p align="center">
  <a href="http://nestjs.com/" target="blank"><img src="https://nestjs.com/img/logo-small.svg" width="200" alt="Nest Logo" /></a>
</p>

[circleci-image]: https://img.shields.io/circleci/build/github/nestjs/nest/master?token=abc123def456
[circleci-url]: https://circleci.com/gh/nestjs/nest

  <p align="center">A progressive <a href="http://nodejs.org" target="_blank">Node.js</a> framework for building efficient and scalable server-side applications.</p>
    <p align="center">
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/v/@nestjs/core.svg" alt="NPM Version" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/l/@nestjs/core.svg" alt="Package License" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/dm/@nestjs/common.svg" alt="NPM Downloads" /></a>
<a href="https://circleci.com/gh/nestjs/nest" target="_blank"><img src="https://img.shields.io/circleci/build/github/nestjs/nest/master" alt="CircleCI" /></a>
<a href="https://coveralls.io/github/nestjs/nest?branch=master" target="_blank"><img src="https://coveralls.io/repos/github/nestjs/nest/badge.svg?branch=master#9" alt="Coverage" /></a>
<a href="https://discord.gg/G7Qnnhy" target="_blank"><img src="https://img.shields.io/badge/discord-online-brightgreen.svg" alt="Discord"/></a>
<a href="https://opencollective.com/nest#backer" target="_blank"><img src="https://opencollective.com/nest/backers/badge.svg" alt="Backers on Open Collective" /></a>
<a href="https://opencollective.com/nest#sponsor" target="_blank"><img src="https://opencollective.com/nest/sponsors/badge.svg" alt="Sponsors on Open Collective" /></a>
  <a href="https://paypal.me/kamilmysliwiec" target="_blank"><img src="https://img.shields.io/badge/Donate-PayPal-ff3f59.svg"/></a>
    <a href="https://opencollective.com/nest#sponsor"  target="_blank"><img src="https://img.shields.io/badge/Support%20us-Open%20Collective-41B883.svg" alt="Support us"></a>
  <a href="https://twitter.com/nestframework" target="_blank"><img src="https://img.shields.io/twitter/follow/nestframework.svg?style=social&label=Follow"></a>
</p>
  <!--[![Backers on Open Collective](https://opencollective.com/nest/backers/badge.svg)](https://opencollective.com/nest#backer)
  [![Sponsors on Open Collective](https://opencollective.com/nest/sponsors/badge.svg)](https://opencollective.com/nest#sponsor)-->

## Description

[Nest](https://github.com/nestjs/nest) framework TypeScript starter repository.

## Installation

```bash
$ yarn install
```

## Running the app

```bash
# development
$ yarn run start

# watch mode
$ yarn run start:dev

# production mode
$ yarn run start:prod
```

## Test

### Validaciones antes del push

Con Docker Desktop iniciado en modo Linux, `git push` ejecuta en contenedores
Node 24 y la versión de pnpm fijada en `packageManager`. Instala dependencias
con `--frozen-lockfile` y corre los mismos comandos compartidos con Actions:
TypeScript, unitarias con cobertura y sus umbrales, HTTP, pruebas de PostgreSQL,
compilación y pruebas del worker de correo con Redis y SMTP controlado.
Cualquier fallo bloquea el push, incluido Docker apagado.

El hook prueba una copia del commit de cada referencia enviada, no los cambios
sin commit. Los nuevos scripts y archivos de CI deben incluirse en el commit.
Para revisar el directorio de trabajo antes de crear ese commit:

```bash
pnpm ci:local
```

Para revisar un commit específico: `pnpm ci:local <SHA-completo>`.
La primera ejecución descarga imágenes y dependencias y tarda más.
PostgreSQL 18.6 y Redis 7.4 son desechables, sin puertos publicados, archivos
`.env` ni acceso a los datos locales. Al terminar se eliminan sus contenedores
y volúmenes. Husky se instala con `pnpm install`; `HUSKY=0` y `--no-verify`
permiten omitir hooks, por lo que los controles de Actions siguen siendo necesarios.

La versión de PostgreSQL de `compose.ci.yaml` y `.github/workflows/deploy.yml`
debe actualizarse junto con producción; ambas fijan `postgres:18.6`.

Estas pruebas reproducen las validaciones previas al deploy. El paso SSH y el
script del VPS solo corren en Actions: conexión, secretos, espacio en disco,
configuración y servicios de producción todavía pueden causar un fallo allí.

```bash
# unit tests
$ yarn run test

# e2e tests
$ yarn run test:e2e

# test coverage
$ yarn run test:cov
```

## Support

Nest is an MIT-licensed open source project. It can grow thanks to the sponsors and support by the amazing backers. If you'd like to join them, please [read more here](https://docs.nestjs.com/support).

## Stay in touch

- Author - [Kamil Myśliwiec](https://kamilmysliwiec.com)
- Website - [https://nestjs.com](https://nestjs.com/)
- Twitter - [@nestframework](https://twitter.com/nestframework)

## License

Nest is [MIT licensed](LICENSE).


## Versión de despliegue y recarga de la UI

`pnpm build` compila la API y, si termina correctamente, crea un UUID en
`dist/deployment-version.json`. En producción, el servicio de despliegues
lee ese ID una vez al arrancar y lo anuncia en el WebSocket con el evento
`api-version`, junto con la versión publicada de UI. Un reinicio de PM2
conserva el ID; un build nuevo obtiene otro incluso para el mismo commit.
El proceso anterior conserva su ID mientras se compila su reemplazo.

La ruta predeterminada usa el directorio de trabajo del proceso PM2.
`API_VERSION_FILE` permite sobrescribir la ruta para pruebas o una instalación
distinta. En desarrollo no se anuncia una versión de API salvo que se indique
esa ruta. El ID se genera en el VPS, sin nuevos secretos de GitHub Actions.

Desplegar primero esta API y después la UI que reconoce `api-version`.
Las UIs anteriores siguen recibiendo los avisos `ui-version` habituales.
