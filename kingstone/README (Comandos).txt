Levantar front web
1. Abrir terminal en el proyecto: `cd C:\Kingstone\kingstone\web\kingstone`.
2. Instalar dependencias (solo primera vez): `npm install`.
3. Iniciar servidor local: `npx @ionic/cli@latest serve --host=localhost --port=8100`.
4. Detener el front con `Ctrl+C` cuando ya no se necesite.
5. Front disponible en `http://localhost:8100/`.

Levantar API y servicios asociados
1. Iniciar base de datos y Adminer: `docker compose up -d db adminer`.
2. Levantar API con build incremental: `docker compose up -d --build api`.
3. Consultar logs de la API: `docker compose logs -f api`.
4. Confirmar contenedores activos: `docker ps` o `docker compose ps`.
5. Adminer disponible en `http://localhost:8080/`.

Reconstruir o reiniciar servicios
* Reconstruir API sin cache: `docker compose build api --no-cache`.
* Reconstruir API trayendo capas nuevas: `docker compose build --pull --no-cache api`.
* Reiniciar API tras limpiar contenedor: `docker compose rm -sf api` y luego `docker compose up -d api`.
* Reiniciar servicios sin destruirlos: `docker compose restart api`.

Detener servicios
* Parar solo la API: `docker compose stop api`.
* Parar todo el stack: `docker compose down`.
* Parar y eliminar volumenes (borra datos locales): `docker compose down -v`.

Migraciones y datos
* Aplicar migraciones desde la CLI: `npx prisma migrate deploy`.
* Ejecutar el contenedor migrate: `docker compose up migrate`.

SQL util
* Dar privilegios de administrador: `UPDATE User SET role='admin' WHERE email='tu@correo.com';`
