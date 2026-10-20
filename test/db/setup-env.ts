import { useTestEnvironment } from './test-database';

// Cada archivo de pruebas corre en su propio entorno: las variables que fijó
// globalSetup no llegan aquí, así que se vuelven a fijar.
useTestEnvironment();
