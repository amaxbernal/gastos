# Gastos · AMAX

App de control de gastos personales del hub AMAX. Multi-moneda (PHP/EUR con tasa
de cambio), categorías editables, e informe mensual automático por Telegram.

## Stack

Mismo patrón que Objetivos e Inventario:

- Node.js 22 + Express
- Supabase KV (tabla `gastos_kv`)
- Basic Auth
- Frontend single-file, sin build step
- Cron mensual en el VPS (no GitHub Actions)

## Base de datos

Antes del primer arranque, en el SQL Editor de Supabase (proyecto `panel-mercado`):

```sql
create table if not exists gastos_kv (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz default now()
);
```

Claves usadas:
- `categorias` — array con las categorías de gasto.
- `gasto:<uuid>` — una fila por gasto.

## Variables de entorno (`.env`)

```
PORT=3005
AUTH_USER=
AUTH_PASS=
SUPABASE_URL=
SUPABASE_KEY=
TELEGRAM_BOT_TOKEN=
TELEGRAM_CHAT_ID=
```

## Despliegue en el VPS

```bash
cd ~/apps
git clone git@github.com-gastos:amaxbernal/gastos.git
cd gastos
npm install
nano .env          # rellenar valores
pm2 start server.js --name gastos --node-args="--env-file=.env"
pm2 save
```

Nginx (como root, en `/etc/nginx/sites-available/amaxbernal.com`):

```nginx
location /gastos {
    proxy_pass http://localhost:3005;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Proto $scheme;
}

location /api/gastos {
    proxy_pass http://localhost:3005;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Proto $scheme;
}
```

## Cron del informe mensual

El informe se envía por Telegram el día 1 de cada mes a las 11:00 de Manila
(03:00 UTC). Se configura en el crontab del usuario `amax`:

```bash
crontab -e
```

Añadir:

```
0 3 1 * * /home/amax/apps/gastos/run-informe.sh
```

El script `run-informe.sh` (crear en la raíz del proyecto, con `chmod +x`):

```bash
#!/bin/bash
cd /home/amax/apps/gastos
set -a
source .env
set +a
/home/amax/.nvm/versions/node/v22.23.1/bin/node scripts/informe-gastos.js >> /home/amax/logs/gastos.log 2>&1
```

**Ojo con la ruta de Node**: está instalado con nvm, no en `/usr/bin/node`.
Verifícala con `which node` como usuario amax.

## API

Todos los endpoints requieren Basic Auth.

| Método | Ruta                  | Qué hace                          |
|--------|-----------------------|-----------------------------------|
| GET    | `/api/categorias`     | Lista de categorías               |
| PUT    | `/api/categorias`     | Actualizar categorías             |
| GET    | `/api/gastos?mes=YYYY-MM` | Gastos (filtrado opcional)   |
| POST   | `/api/gastos`         | Crear gasto                       |
| PUT    | `/api/gastos/:id`     | Editar gasto                      |
| DELETE | `/api/gastos/:id`     | Borrar gasto                      |
| DELETE | `/api/gastos`         | Borrar TODOS los gastos           |
| POST   | `/api/seed`           | Cargar ~90 gastos de ejemplo      |

## Datos de ejemplo

La app tiene una sección "Herramientas" abajo con dos botones:
- **Cargar datos de ejemplo**: ~90 gastos de los últimos 6 meses, incluyendo un
  viaje a España en EUR.
- **Borrar todos los gastos**: pide confirmación escribiendo "BORRAR".

Útil para ver cómo se comporta la app antes de meter datos reales. Acuérdate de
borrarlos antes de empezar en serio.
