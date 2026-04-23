module.exports = {
  apps: [
    {
      name: 'hallazgos-api', // Nombre de la aplicación
      script: 'dist/main.js', // Archivo compilado de NestJS
      instances: 1, // Usa una sola instancia en modo fork
      exec_mode: 'fork', // Modo de ejecución (fork o cluster)
      watch: false, // Desactiva watch en producción
      max_memory_restart: '5G', // Reinicia si excede 5GB de RAM
      env: {
        NODE_ENV: 'production', // Variables de entorno para producción
        PORT: 4000,
      },
      out_file: './logs/out.log', // Log de salida estándar
      error_file: './logs/error.log', // Log de errores
      merge_logs: true, // Combina logs de instancias
      time: true, // Añade timestamp a los logs
    },
  ],
};
