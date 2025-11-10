Levantar front web
1. Abrir terminal en el proyecto: `cd C:\Kingstone\kingstone\web\kingstone`.
2. Instalar dependencias (solo primera vez): `npm install`.
3. Iniciar servidor local: `npx @ionic/cli@latest serve --host=localhost --port=8100`.
   Nota: si ejecutas este comando desde otra carpeta (por ejemplo `Proyecto_Titulo`), Angular no encontrará las plantillas (`NG2008: Could not find template file`).
4. Detener el front con `Ctrl+C` cuando ya no se necesite.
5. Front disponible en `http://localhost:8100/`.

Levantar API y servicios asociados
1. Un solo comando (levanta DB, aplica migraciones automáticamente y arranca API/worker/n8n/adminer): `docker compose up -d`.
2. Confirmar contenedores activos: `docker ps` o `docker compose ps`.
3. Logs de la API: `docker compose logs -f api`. Logs del worker: `docker compose logs -f worker`.
4. Adminer disponible en `http://localhost:8080/`.

Notas
- `docker-compose.yml` usa `./.env.production` por defecto. No es necesario copiar/crear `.env`.
- El servicio `migrate` corre `npx prisma migrate deploy` automáticamente antes de `api` y `worker`.

Reconstruir o reiniciar servicios
- Reconstruir API sin cache: `docker compose build api --no-cache`.
- Reconstruir worker sin cache: `docker compose build worker --no-cache`.
- Reconstruir API trayendo capas nuevas: `docker compose build --pull --no-cache api`.
- Reconstruir worker trayendo capas nuevas: `docker compose build --pull --no-cache worker`.
- Reiniciar API tras limpiar contenedor: `docker compose rm -sf api` y luego `docker compose up -d api`.
- Reiniciar worker tras limpiar contenedor: `docker compose rm -sf worker` y luego `docker compose up -d worker`.
- Reiniciar servicios sin destruirlos: `docker compose restart api`.
- Atajo habitual tras cambios en backend: `docker compose build api worker && docker compose up -d`.

Detener servicios
- Parar solo la API: `docker compose stop api`.
- Parar solo el worker: `docker compose stop worker`.
- Parar todo el stack: `docker compose down`.
- Parar y eliminar volúmenes (borra datos locales): `docker compose down -v`.

Reset completo (empezar desde cero)
- `docker compose down -v` y luego `docker compose up -d`.

Migraciones y datos
- Se aplican automáticamente al levantar el stack (servicio `migrate`).
- Ejecutarlas manualmente (opcional): `docker compose run --rm migrate` o `docker compose run --rm api npx prisma migrate deploy`.
- Directorio de uploads configurado en docker: volumen `uploads_data` montado en `/app/uploads/pedidos`.

SQL útil
- Dar privilegios de administrador: `UPDATE User SET role='admin' WHERE email='tu@correo.com';`

n8n en producción (workflow cotizaciones)
1. Preparar archivo `.env.production` copiando `.env` y ajustando: `N8N_HOST=n8n.kingstone.local`, `N8N_PROTOCOL=https`, `N8N_PORT=5678` (si usarás un proxy externo para TLS) y `N8N_WEBHOOK_URL=http://n8n:5678/webhook/cotizacion-alerta` para que la API hable por red interna. Define credenciales reales en `N8N_BASIC_AUTH_USER/N8N_BASIC_AUTH_PASSWORD`.
2. Subir a tu servidor los archivos `n8n-smtp-credentials.json` y `n8n-cotizacion-alerta.workflow.json` (`scp` o Git). Ejecutar `docker compose up -d n8n` para levantar el contenedor con el nuevo dominio.
3. Copiar los JSON dentro del contenedor y registrar credenciales/workflow:
   - `docker cp n8n-smtp-credentials.json kingstone_n8n:/tmp/`
   - `docker exec kingstone_n8n n8n import:credentials --input=/tmp/n8n-smtp-credentials.json`
   - `docker cp n8n-cotizacion-alerta.workflow.json kingstone_n8n:/tmp/`
   - `docker exec kingstone_n8n n8n import:workflow --input=/tmp/n8n-cotizacion-alerta.workflow.json`
   - `docker exec kingstone_n8n n8n list:workflow` (anota el ID) y `docker exec kingstone_n8n n8n update:workflow --id <ID> --active=true`
4. En el mismo servidor reinicia API y worker para que lean `N8N_WEBHOOK_URL`: `docker compose restart api worker`.
5. Prueba desde una máquina con DNS apuntando a la instancia: `curl -u admin@kingstone.local:TU_PASSWORD https://n8n.kingstone.local/webhook/cotizacion-alerta -H "Content-Type: application/json" -d "{\"cotizacionId\":999,\"asignacionId\":1,\"operadorEmail\":\"ops@kingstone.local\",\"operadorNombre\":\"Operador\",\"clienteNombre\":\"Cliente\",\"enlace\":\"https://app.kingstone.local/operacion/cotizaciones/999\"}"`. Debería responder `200 OK` y verás el correo en el buzón SMTP configurado.
6. El workflow envía automáticamente dos correos: uno al operador (`operadorEmail`) y otro al cliente (`clienteEmail`). Si ese campo no llega en el payload, la rama del cliente se omite sin afectar la notificación del operador.
7. Para los cambios de estado de pedidos define también `N8N_PEDIDOS_WEBHOOK_URL=http://n8n:5678/webhook/pedido-estado`, importa `n8n-pedido-estado.workflow.json` y actívalo. Ese flujo lee el payload de `notifyPedidoEstado`, envía el correo al cliente y reenvía un resumen al operador que ejecutó la acción (usando su email como `reply-to`).

