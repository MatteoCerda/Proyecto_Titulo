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

WhatsApp Cloud + n8n (cotización/pedido)
1. Define estas variables en `kingstone/.env.production` antes de reconstruir la API:
   - `KINGSTONE_API_BASE=http://api:3000` (o la URL pública del backend).
   - `KINGSTONE_OPERATOR_EMAIL` y `KINGSTONE_OPERATOR_PASSWORD` (cuenta de servicio para que n8n haga login).
   - `WHATSAPP_CLOUD_TOKEN` (token permanente de Meta).
   - `WHATSAPP_VERIFY_TOKEN` (texto que configurarás tanto en Meta como en n8n).
2. Importa el workflow `n8n-whatsapp-intake.workflow.json`:
   - `docker cp n8n-whatsapp-intake.workflow.json kingstone_n8n:/tmp/`
   - `docker exec kingstone_n8n n8n import:workflow --input=/tmp/n8n-whatsapp-intake.workflow.json`
   - `docker exec kingstone_n8n n8n update:workflow --id <ID> --active=true`
3. En Meta Developers configura el Webhook en `https://<tu-n8n>/webhook/whatsapp-intake` usando `WHATSAPP_VERIFY_TOKEN`. El nodo Webhook acepta GET (verificación) y POST (mensajes). Si usas proxy/certificados, asegúrate de exponer ese path con TLS válido.
4. Flujo implementado:
   - Webhook recibe el JSON de WhatsApp Cloud, normaliza el texto, adjuntos y detecta la intención (`cotizacion`, `pedido` o `estado`).
   - Intención `cotizacion`: envía `POST /api/cotizaciones` con `canal=whatsapp` y responde al cliente con un mensaje confirmando el folio.
   - Intención `pedido`: hace login de operador (`/auth/login/operator`), crea el pedido en `/api/pedidos` y confirma el número por WhatsApp.
   - Intención `estado`: vuelve a loguear operador, consulta `/api/pedidos/:id` (extrae el ID del texto “estado 1234”) y responde con el estado actual.
   - Todos los mensajes de salida se envían por `https://graph.facebook.com/v17.0/{phoneNumberId}/messages` usando `WHATSAPP_CLOUD_TOKEN`.
5. Para usar archivos, descarga el media ID desde WhatsApp Cloud en n8n (nodo HTTP GET `/{media-id}` con el mismo token) y súbelo luego a `/api/pedidos/:id/files` si necesitas adjuntarlo al pedido.
6. Recuerda proteger n8n con Basic Auth (`N8N_BASIC_AUTH_*`) y valida las firmas (`X-Hub-Signature-256`) en el Webhook cuando muevas esto a producción.

Pagos Webpay (Integracion)
1. En `kingstone/backend` corre `npm install` para asegurarte de tener `transbank-sdk`.
2. Configura las variables en `.env` o `.env.production`:
   - `WEBPAY_COMMERCE_CODE` y `WEBPAY_API_KEY` (sandbox por defecto).
   - `WEBPAY_ENVIRONMENT` (`integration` o `production`).
   - `WEBPAY_CALLBACK_URL` (ruta del backend que recibe el POST de Webpay, por defecto `http://localhost:3000/api/payments/webpay/return`).
   - `WEBPAY_FRONT_RETURN_URL` o `WEBPAY_RETURN_URL` (ruta del front que mostrara el resultado, p. ej. `http://localhost:8100/pagos/webpay/retorno`).
3. Rutas nuevas (requieren auth):
   - `POST /api/payments/webpay/create` recibe `{ pedidoId, amount?, returnUrl? }` y devuelve `{ token, url, buyOrder, amount }`.
   - `POST /api/payments/webpay/commit` y `POST /api/payments/webpay/status` reciben `{ token }` (tambien aceptan `token_ws` o `TBK_TOKEN`).
4. Flujo recomendado: crear transaccion -> redirigir a `url` con `token` -> el navegador vuelve al backend (`WEBPAY_CALLBACK_URL`), este redirige al front (`WEBPAY_FRONT_RETURN_URL`) con el `token_ws` -> el front llama `commit` para cerrar y registrar la operacion.
5. Para probar usa los datos de tarjetas de integracion publicados en https://www.transbankdevelopers.cl. En produccion reemplaza credenciales y establece `WEBPAY_ENVIRONMENT=production`.
6. El backend registra cada pago ligado al `pedidoId`, guarda el resultado de `commit` y si recibe `AUTHORIZED` cambia automaticamente el pedido de `POR_PAGAR/EN_REVISION` a `EN_PRODUCCION`.
7. Si necesitas reintentos, consulta `/status` y muestra al cliente el detalle (respuestas exitosas y rechazadas quedan guardadas en la tabla `webpay_transaction`).
8. En el front (Perfil > Mis pedidos) aparecera el boton **Pagar con Webpay** cuando el pedido este `POR_PAGAR/EN_REVISION`. Al terminar, Webpay redirige al front donde se confirma el `token_ws` y se muestra el resultado.
