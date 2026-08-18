# GeoKaia Backend

[![Known Vulnerabilities](https://snyk.io/test/github/GeoKaia/GeoKaia-Backend/badge.svg)](https://snyk.io/test/github/GeoKaia/GeoKaia-Backend)

API REST del sistema GeoKaia — Plataforma de turismo digital para Nicaragua.
Deployada en: https://geokaia-backend.onrender.com

> Plataforma interactiva de turismo creativo y cultural en Nicaragua que utiliza IA para recomendar rutas curadas y experiencias inmersivas 360°. Proyecto desarrollado por el equipo Techyardigans para el Hackathon Nicaragua 2026 (categoría Avanzado).

---

## Tabla de contenidos

- [Descripción general](#descripción-general)
- [Tecnologías usadas](#tecnologías-usadas)
- [Instalación](#instalación)
- [Ejecución](#ejecución)
- [Arquitectura del sistema](#arquitectura-del-sistema)
- [Dependencias](#dependencias)
- [Variables de entorno](#variables-de-entorno)
- [Estructura modular](#estructura-modular)
- [Endpoints de la API](#endpoints-de-la-api)
- [Seguridad](#seguridad)
- [Contribuciones](#contribuciones)
- [Licencia](#licencia)

---

## Descripción general

GeoKaia centraliza y optimiza la exploración turística en Nicaragua. Resuelve la fragmentación de la información cultural mediante un mapa interactivo (orientado a nodos creativos) y rutas temáticas curadas.

El sistema está diseñado para dos tipos de usuarios:
* **Turistas (B2C)**: acceden a exploración sin fricción y sin login requerido, visualizan el mapa con pines diferenciados por categoría/subcategoría, y consultan a Kaia, un agente de IA que recomienda rutas ya existentes según lo que el turista describe (no genera rutas nuevas).
* **Negocios y MiPymes (B2B)**: mediante un modelo Freemium/Premium, un negocio registra su lugar (queda pendiente de aprobación del equipo GeoKaia), y con el plan Premium suma galería de fotos, video, visor 360° (Pannellum), menú digital y audio descriptivo.

Este repo es solo el backend (API REST). El frontend vive en [GeoKaia-Frontend](https://github.com/GeoKaia/GeoKaia-Frontend).

---

## Tecnologías usadas

| Tecnología | Versión | Uso |
|---|---|---|
| Node.js | 20.x | Entorno de ejecución del servidor |
| Express.js | 5.x | Framework de la API REST |
| PostgreSQL | 15+ | Base de datos relacional, alojada en Neon (serverless) |
| Prisma ORM | 7.8 | Modelado de datos y acceso a la base (vía `@prisma/adapter-pg`) |
| Zod | 4.x | Validación de esquemas en cada endpoint de escritura |
| JWT (jsonwebtoken) | 9.x | Autenticación de negocios, sesión válida por 8 horas |
| bcrypt | 6.x | Hash de contraseñas |
| Speakeasy + qrcode | — | Verificación en dos pasos (TOTP / Google Authenticator) |
| Groq SDK (Llama 3.3 70B) | — | Agente de IA que recomienda rutas existentes según lo que pide el turista |

---

## Instalación

**Requisitos previos:**

- Node.js >= 18
- Git
- Cuenta activa en [Neon](https://neon.tech) (PostgreSQL) y en [Groq](https://groq.com) (API Key)

```bash
# 1. Clona el repositorio
git clone https://github.com/GeoKaia/GeoKaia-Backend.git
cd GeoKaia-Backend

# 2. Instala las dependencias
npm install

# 3. Configura las variables de entorno
cp .env.example .env
# Edita el archivo .env con tus credenciales (ver tabla de variables más abajo)

# 4. Aplica las migraciones y genera el cliente de Prisma
npx prisma migrate deploy
npx prisma generate
```

> El proyecto usa migraciones versionadas (`prisma/migrations/`), no `prisma db push` — cualquier cambio de schema debe pasar por `npx prisma migrate dev --name <descripcion>` para quedar registrado y ser reproducible en otros entornos.

---

## Ejecución

```bash
npm run dev
```

Levanta el servidor con `nodemon` en `http://localhost:4000` (o el puerto que definas en `PORT`), reiniciando automáticamente ante cualquier cambio en `src/`.

En producción, el proceso se levanta con `node src/index.js` — actualmente deployado en [Render](https://render.com) (plan gratuito, por lo que el primer request tras inactividad puede tardar ~30s en responder mientras el servicio "despierta").

---

## Arquitectura del sistema

```
[ Interfaz de Usuario / Frontend en Next.js — repo GeoKaia-Frontend ]
  |-- Componentes reutilizables (PlaceCard, RouteCard)
  |-- Módulo de mapa (MapTiler + react-leaflet)
  |-- Visor 360° inmersivo (Pannellum)
  |-- Interfaz de IA conversacional (Kaia)
            |
            | Peticiones HTTP / JSON (fetch)
            v
[ Enrutamiento y seguridad — Express, este repo ]
  |-- CORS + parseo de JSON (middlewares globales)
  |-- authMiddleware (valida JWT) / adminMiddleware (valida rol admin)
  |-- validate.middleware (valida el body contra un schema de Zod)
            |
            v
[ Controladores — lógica de negocio por entidad ]
  auth · lugares · rutas · ia · leads
            |
            | Agente recomendador <--> [ Groq API / Llama 3.3 ]
            v
[ Prisma ORM (adapter-pg) ]
            |
            v
[ PostgreSQL en Neon — esquema relacional 3FN ]
  Negocio · Lugar · Ruta · ParadaRuta · Lead
```

**Decisiones clave:**
- **Sin subida de archivos**: fotos, video, audio y visor 360° se guardan como URLs (`fotoUrl`, `videoUrl`, `audioUrl`, `panoramaUrl`), no como binarios en el servidor — evita infraestructura de storage y mantiene el backend liviano.
- **Contenido curado vs. contenido de negocio**: un negocio solo puede crear/editar su propio `Lugar` (queda `PENDIENTE` hasta que un admin lo aprueba). Las `Ruta` las arma un admin a partir de lugares ya aprobados — no hay flujo para que un negocio cree una ruta.
- **2FA obligatorio**: todo negocio que se registra recibe un secret TOTP (QR para Google Authenticator); el login no entrega el JWT hasta verificar el código de 6 dígitos.

---

## Dependencias

| Paquete | Uso |
|---|---|
| `express` | Framework HTTP / enrutamiento |
| `@prisma/client`, `@prisma/adapter-pg`, `prisma` | ORM y acceso a PostgreSQL |
| `pg` | Driver de PostgreSQL usado por el adapter de Prisma |
| `zod` | Validación de los `req.body` de cada endpoint de escritura |
| `jsonwebtoken` | Emisión y verificación de JWT |
| `bcrypt` | Hash y comparación de contraseñas |
| `speakeasy` | Generación y verificación de códigos TOTP (2FA) |
| `qrcode` | Genera el QR que el negocio escanea para activar 2FA |
| `groq-sdk` | Cliente del modelo de IA (Llama 3.3 70B) que recomienda rutas |
| `cors` | Habilita requests cross-origin desde el frontend |
| `dotenv` | Carga `.env` en `process.env` |
| `nodemon` *(dev)* | Reinicio automático del servidor en desarrollo |

---

## Variables de entorno

Copiá `.env.example` a `.env` y completá:

| Variable | Obligatoria | Descripción |
|---|---|---|
| `DATABASE_URL` | Sí | Connection string de PostgreSQL (Neon). Formato `postgresql://usuario:password@host/db?sslmode=require` |
| `JWT_SECRET` | Sí | Secreto usado para firmar y verificar los JWT de sesión |
| `GROQ_API_KEY` | Sí | API Key de Groq, usada por el agente de recomendación de rutas |
| `PORT` | No | Puerto del servidor. Default `4000` si no se define |

---

## Estructura modular

```
src/
├── index.js                     # Punto de entrada: registra middlewares y rutas, levanta el servidor
├── controllers/                 # Lógica de negocio, un archivo por entidad
│   ├── auth.controller.js       # Registro, login, 2FA, borrado de cuenta
│   ├── lugares.controller.js    # CRUD del lugar de un negocio + cola de aprobación admin
│   ├── rutas.controller.js      # CRUD de rutas curadas (admin) con sus paradas
│   ├── ia.controller.js         # Integración con Groq para recomendar rutas
│   └── leads.controller.js      # Formulario de contacto de negocios interesados
├── routes/                      # Definición de endpoints + validación (Zod) por recurso
├── middleware/
│   ├── auth.middleware.js       # Verifica el JWT y adjunta req.negocio
│   ├── admin.middleware.js      # Verifica esAdmin en la base (no confía en el JWT)
│   └── validate.middleware.js   # Valida req.body contra un schema de Zod
prisma/
├── schema.prisma                # Modelo de datos (Negocio, Lugar, Ruta, ParadaRuta, Lead)
└── migrations/                  # Historial de migraciones versionadas
scripts/
└── set-admin-password.js        # Utilidad para promover una cuenta a esAdmin=true
```

---

## Endpoints de la API

Base URL: `https://geokaia-backend.onrender.com` (o `http://localhost:4000` en local).
🔓 público · 🔒 requiere JWT de negocio · 👑 requiere JWT de una cuenta con `esAdmin: true`

### Auth — `/api/auth`

| Método | Ruta | Acceso | Descripción |
|---|---|---|---|
| POST | `/registrar` | 🔓 | Crea la cuenta del negocio, genera el secret TOTP y devuelve el QR |
| POST | `/login` | 🔓 | Valida email + contraseña, no entrega el JWT todavía |
| POST | `/verificar-2fa` | 🔓 | Valida el código TOTP de 6 dígitos y recién ahí entrega el JWT (8h) |
| DELETE | `/cuenta` | 🔒 | Borra la cuenta y su lugar (pide la contraseña de nuevo) |

### Lugares — `/api/lugares`

| Método | Ruta | Acceso | Descripción |
|---|---|---|---|
| GET | `/` | 🔓 | Lista los lugares con `estado: APROBADO` (lo que se ve en el mapa público) |
| GET | `/:id` | 🔓 | Un lugar puntual, con su negocio y las rutas donde aparece |
| GET | `/mi-lugar` | 🔒 | El lugar del negocio autenticado (para precargar su panel) |
| POST | `/` | 🔒 | Crea el lugar del negocio (tier Gratis/Premium), queda `PENDIENTE` |
| PATCH | `/mi-lugar` | 🔒 | Edita el contenido del lugar propio (campos premium se ignoran si el tier es Gratis) |
| DELETE | `/mi-lugar` | 🔒 | Borra el lugar (mantiene la cuenta), pide la contraseña |
| GET | `/admin/pendientes` | 👑 | Lista lugares en cola de aprobación |
| PATCH | `/admin/:id/estado` | 👑 | Aprueba o rechaza un lugar |

### Rutas — `/api/rutas`

| Método | Ruta | Acceso | Descripción |
|---|---|---|---|
| GET | `/` | 🔓 | Lista todas las rutas con sus paradas y lugares anidados |
| POST | `/` | 👑 | Crea una ruta con sus paradas (solo lugares ya `APROBADO`) |
| PATCH | `/:id` | 👑 | Edita una ruta; si llegan `paradas`, reemplaza todas |
| DELETE | `/:id` | 👑 | Borra una ruta y sus paradas |

### IA — `/api/ia`

| Método | Ruta | Acceso | Descripción |
|---|---|---|---|
| POST | `/recomendar-ruta` | 🔓 | Kaia recomienda rutas ya existentes según la consulta en lenguaje natural del turista |

### Leads — `/api/leads`

| Método | Ruta | Acceso | Descripción |
|---|---|---|---|
| POST | `/` | 🔓 | Registra el interés de un negocio en sumarse a la plataforma |

### Ejemplos

Registrar un negocio y ver el catálogo público de lugares:

```bash
curl -X POST https://geokaia-backend.onrender.com/api/auth/registrar \
  -H "Content-Type: application/json" \
  -d '{"email":"minegocio@correo.com","password":"minimo6caracteres","nombreContacto":"Nombre Apellido","whatsapp":"+50588888888"}'

curl https://geokaia-backend.onrender.com/api/lugares
```

Pedirle a Kaia una recomendación:

```bash
curl -X POST https://geokaia-backend.onrender.com/api/ia/recomendar-ruta \
  -H "Content-Type: application/json" \
  -d '{"consulta":"quiero ver volcanes y comer algo típico"}'
```

Editar el contenido del lugar propio (requiere el JWT obtenido tras `/verificar-2fa`):

```bash
curl -X PATCH https://geokaia-backend.onrender.com/api/lugares/mi-lugar \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <TOKEN>" \
  -d '{"descripcion":"Nueva descripción del lugar con al menos diez caracteres"}'
```

---

## Seguridad

- **Validación de entradas**: todo endpoint de escritura pasa por un schema de Zod (`validate.middleware.js`) antes de llegar al controller.
- **Manejo de errores**: cada controller responde con un `error` descriptivo y el status HTTP correspondiente (400 validación, 401/403 autenticación/autorización, 404 no encontrado, 500 error de servidor) — nunca se cae el proceso.
- **Roles y permisos**: `authMiddleware` exige un JWT válido; `adminMiddleware` además re-consulta en la base que la cuenta tenga `esAdmin: true` (no confía en el contenido del JWT).
- **Autenticación en dos factores**: TOTP con `speakeasy`, obligatorio para toda cuenta de negocio.
- **Expiración de sesión**: el JWT vence a las 8 horas (`expiresIn: '8h'`).
- **Contraseñas**: se guardan con `bcrypt`, nunca en texto plano.

---

## Contribuciones

Flujo de trabajo: rama por feature (`feat/nombre-descriptivo`), commits siguiendo [Conventional Commits](https://www.conventionalcommits.org/) (`feat:`, `fix:`, `chore:`, etc.) y Pull Request hacia `main` para mantener trazabilidad y revisión antes de mergear.

## Licencia

ISC — proyecto desarrollado con fines académicos para el Hackathon Nicaragua 2026.
