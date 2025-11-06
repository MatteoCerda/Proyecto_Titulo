Levantar front web
1. Abrir terminal en el proyecto: `cd C:\Kingstone\kingstone\web\kingstone`.
2. Instalar dependencias (solo primera vez): `npm install`.
3. Iniciar servidor local: `npx @ionic/cli@latest serve --host=localhost --port=8100`.
   Nota: si ejecutas este comando desde otra carpeta (por ejemplo `Proyecto_Titulo`), Angular no encontrara las plantillas (`NG2008: Could not find template file`).
4. Detener el front con `Ctrl+C` cuando ya no se necesite.
5. Front disponible en `http://localhost:8100/`.

Levantar API y servicios asociados
1. Iniciar base de datos y Adminer: `docker compose up -d db adminer`.
2. Reconstruir imágenes si hubo cambios en backend/worker: `docker compose build api worker`.
3. Aplicar migraciones pendientes: `docker compose run --rm api npx prisma migrate deploy`.
4. Levantar API y worker: `docker compose up -d api worker`.
5. Consultar logs de la API: `docker compose logs -f api`.
6. Consultar logs del worker de archivos: `docker compose logs -f worker`.
7. Confirmar contenedores activos: `docker ps` o `docker compose ps`.
8. Adminer disponible en `http://localhost:8080/`.

Reconstruir o reiniciar servicios
* Reconstruir API sin cache: `docker compose build api --no-cache`.
* Reconstruir worker sin cache: `docker compose build worker --no-cache`.
* Reconstruir API trayendo capas nuevas: `docker compose build --pull --no-cache api`.
* Reconstruir worker trayendo capas nuevas: `docker compose build --pull --no-cache worker`.
* Reiniciar API tras limpiar contenedor: `docker compose rm -sf api` y luego `docker compose up -d api`.
* Reiniciar worker tras limpiar contenedor: `docker compose rm -sf worker` y luego `docker compose up -d worker`.
* Reiniciar servicios sin destruirlos: `docker compose restart api`.
*docker compose build api worker && docker compose up -d

Detener servicios
* Parar solo la API: `docker compose stop api`.
* Parar solo el worker: `docker compose stop worker`.
* Parar todo el stack: `docker compose down`.
* Parar y eliminar volumenes (borra datos locales): `docker compose down -v`.

Migraciones y datos
* Aplicar migraciones desde la CLI: `npx prisma migrate deploy`.
* Ejecutar migraciones dentro del contenedor: `docker compose run --rm api npx prisma migrate deploy`.
* Directorio de uploads configurado en docker: volumen `uploads_data` montado en `/app/uploads/pedidos`.

SQL util
* Dar privilegios de administrador: `UPDATE User SET role='admin' WHERE email='tu@correo.com';`
