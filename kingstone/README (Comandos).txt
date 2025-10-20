-Levantar Front
cd C:\Kingstone\kingstone\web\kingstone
npx @ionic/cli@latest serve --host=localhost --port=8100

-Levanta la API y Levantar backend 
docker compose up -d db
docker compose up -d adminer
docker compose up -d --build api
docker compose logs -f api (confirmar si esta funcionando todo)

(opcional reconstruir sin cache)
docker compose build api --no-cache
docker compose build --pull --no-cache api

Si hay errores ejecutar esto:
docker compose rm -sf api
docker compose up -d

docker ps(confirmar si los contenedores están activos)


-Dar privilegios de administrador a un usuario
UPDATE User SET role='admin' WHERE email='tu@correo.com'; 


Puerto para el front: http://localhost:8100/
Puerto util para adminer: http://localhost:8080/

- migrar datos en docker
npx prisma migrate deploy
docker compose up migrate