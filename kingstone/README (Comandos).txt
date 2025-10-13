-Levanta la API
cd C:\Kingstone\kingstone\backend
npm run dev

-Levantar Front
cd C:\Kingstone\kingstone\web\kingstone
npx @ionic/cli@latest serve --host=localhost --port=8100

-Ver datos BD con Prisma
cd C:\Kingstone\kingstone\backend
npx prisma studio

-Levantar backend 
C:\Proyecto_Titulo\kingstone\backend>
Docker compose up -d db
docker compose up -d adminer
docker compose up -d
docker compose rm -sf api
docker compose build api --no-cache