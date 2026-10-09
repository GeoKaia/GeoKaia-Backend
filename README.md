# GeoKaia Backend

[![Known Vulnerabilities](https://snyk.io/test/github/GeoKaia/GeoKaia-Backend/badge.svg)](https://snyk.io/test/github/GeoKaia/GeoKaia-Backend)

API REST del sistema GeoKaia — Plataforma de turismo digital para Nicaragua.
Deployada en: https://geokaia-backend.onrender.com

> Plataforma interactiva de turismo creativo y cultural en Nicaragua que utiliza IA para recomendar rutas curadas y experiencias inmersivas 360°. Proyecto desarrollado por el equipo Techyardigans para el Hackathon Nicaragua 2026 (categoría Avanzado).

---

<h3 align="center">Stack</h3>

<p align="center">
  <a href="https://nodejs.org"><img src="https://img.shields.io/badge/Node.js-20-10546F?style=for-the-badge&logo=nodedotjs&logoColor=white&labelColor=3A2B1D" alt="Node.js 20" /></a>
  <a href="https://expressjs.com"><img src="https://img.shields.io/badge/Express-5-10546F?style=for-the-badge&logo=express&logoColor=white&labelColor=3A2B1D" alt="Express 5" /></a>
  <a href="https://www.prisma.io"><img src="https://img.shields.io/badge/Prisma-7-10546F?style=for-the-badge&logo=prisma&logoColor=white&labelColor=3A2B1D" alt="Prisma 7" /></a>
  <a href="https://www.postgresql.org"><img src="https://img.shields.io/badge/PostgreSQL-15%2B-2989A3?style=for-the-badge&logo=postgresql&logoColor=white&labelColor=3A2B1D" alt="PostgreSQL 15" /></a>
  <a href="https://neon.com"><img src="https://img.shields.io/badge/Neon-serverless-2989A3?style=for-the-badge&logo=neon&logoColor=white&labelColor=3A2B1D" alt="Neon serverless" /></a>
</p>

<p align="center">
  <a href="https://zod.dev"><img src="https://img.shields.io/badge/Zod-4-AC6727?style=for-the-badge&logo=zod&logoColor=white&labelColor=3A2B1D" alt="Zod 4" /></a>
  <a href="https://jwt.io"><img src="https://img.shields.io/badge/JWT-8h%20%2B%202FA-AC6727?style=for-the-badge&logo=jsonwebtokens&logoColor=white&labelColor=3A2B1D" alt="JWT" /></a>
  <a href="https://helmetjs.github.io"><img src="https://img.shields.io/badge/Helmet-headers-AC6727?style=for-the-badge&labelColor=3A2B1D" alt="Helmet" /></a>
  <a href="https://groq.com"><img src="https://img.shields.io/badge/Groq-IA-AC6727?style=for-the-badge&labelColor=3A2B1D" alt="Groq" /></a>
  <a href="https://render.com"><img src="https://img.shields.io/badge/Render-deploy-3A2B1D?style=for-the-badge&logo=render&logoColor=white&labelColor=3A2B1D" alt="Desplegado en Render" /></a>
</p>

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
| Groq SDK (`openai/gpt-oss-20b`) | — | Agente de IA que recomienda rutas existentes según lo que pide el turista |
| Helmet | 8.x | Cabeceras HTTP de seguridad |
| express-rate-limit | 8.x | Límite de peticiones (fuerza bruta y DoS a nivel de aplicación) |

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
  |-- helmet (cabeceras) + CORS con lista de orígenes + límite de peticiones por IP
  |-- parseo de JSON con tope de 50 kb
  |-- authMiddleware (valida JWT) / adminMiddleware (valida rol admin)
  |-- validate.middleware (valida el body contra un schema de Zod y entrega solo lo validado)
  |-- limites.middleware (rate limiting por recurso) · validarId.middleware (:id entero)
            |
            v
[ Controladores — lógica de negocio por entidad ]
  auth · lugares · rutas · ia · leads
            |
            | Agente recomendador <--> [ Groq API / gpt-oss-20b ]
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
| `groq-sdk` | Cliente del modelo de IA (`openai/gpt-oss-20b`) que recomienda rutas |
| `helmet` | Cabeceras HTTP de seguridad |
| `express-rate-limit` | Límite de peticiones por IP / por cuenta |
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
| `CORS_ORIGINS` | No | Orígenes del navegador autorizados a llamar a la API, separados por coma. Se suman a los dominios del frontend (`geokaia.vercel.app` y `geo-kaia-frontend.vercel.app`); `localhost` siempre se permite para desarrollo |
| `ADMIN_EDICION_LUGARES` | No | `true` reactiva la edición de lugares ajenos por parte del admin (`PATCH /api/lugares/admin/:id`). Default apagado |

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
│   ├── validate.middleware.js   # Valida req.body contra un schema de Zod y entrega solo lo validado
│   ├── limites.middleware.js    # Rate limiting: general, login, 2FA, registro, leads, chat de IA
│   └── validarId.middleware.js  # Rechaza con 400 cualquier :id que no sea un entero positivo
├── utils/
│   ├── validarUrls.js           # Verifica que cada link sea http(s) y lo que dice ser (foto, Maps, Waze)
│   └── errores.js               # Respuesta 500 genérica; el detalle queda solo en el log
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
| GET | `/:id` | 🔓 | Un lugar aprobado, con las rutas donde aparece (no expone datos del negocio dueño) |
| GET | `/mi-lugar` | 🔒 | El lugar del negocio autenticado (para precargar su panel) |
| GET | `/mi-lugar/comentarios` | 🔒 | Comentarios del equipo en el lugar propio (solo lectura, sin el correo del admin) |
| POST | `/` | 🔒 | Crea el lugar del negocio (tier Gratis/Premium), queda `PENDIENTE` |
| PATCH | `/mi-lugar` | 🔒 | Edita el contenido del lugar propio (campos premium se ignoran si el tier es Gratis) |
| DELETE | `/mi-lugar` | 🔒 | Borra el lugar (mantiene la cuenta), pide la contraseña |
| GET | `/admin/pendientes` | 👑 | Lista lugares en cola de aprobación |
| PATCH | `/admin/:id/estado` | 👑 | Aprueba o rechaza un lugar |
| GET | `/admin/todos` | 👑 | Lista todos los lugares, de cualquier estado |
| PATCH | `/admin/:id` | 👑 | Edita cualquier lugar. **Desactivado por defecto** (responde 403): el equipo deja comentarios y cada negocio corrige lo suyo. Se reactiva con `ADMIN_EDICION_LUGARES=true` |
| DELETE | `/admin/:id` | 👑 | Borra cualquier lugar (y sus comentarios) |
| GET | `/admin/:id/comentarios` | 👑 | Lista los comentarios que el equipo dejó en un lugar |
| POST | `/admin/:id/comentarios` | 👑 | Deja un comentario para el negocio (3 a 1000 caracteres); queda con el correo del admin |
| DELETE | `/admin/comentarios/:comentarioId` | 👑 | Borra un comentario |

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

La API se protege en capas. Cada una corresponde a un tipo de ataque habitual:

| Amenaza | Defensa en este repo |
|---|---|
| **Inyección SQL** | No hay SQL escrito a mano: todo el acceso a datos pasa por Prisma, que envía los valores como parámetros de una consulta preparada (nunca concatenados al texto SQL). Además no se usa `$queryRaw`/`$executeRaw`. Aun así cada entrada se valida antes de llegar al ORM. |
| **Datos mal formados / mass assignment** | Todo endpoint con cuerpo pasa por un schema de Zod (`validate.middleware.js`): tipos, largos máximos, rangos de coordenadas, enums de categoría y formato del código 2FA. El body validado **reemplaza** al original, así que los campos que no declara el schema se descartan. Los `:id` se validan como enteros (`validarId.middleware.js`). |
| **XSS almacenado** | Los links que carga un negocio solo se aceptan si son `http://` o `https://` (`utils/validarUrls.js`): `z.string().url()` por sí solo deja pasar `javascript:`. Mapas, Waze y foto se verifican además por dominio/extensión. El frontend repite la comprobación al mostrarlos. |
| **Fuerza bruta (login y 2FA)** | `express-rate-limit`: 20 intentos fallidos de login por IP cada 15 min; el código 2FA tiene tope por IP (30) **y por cuenta** (8) cada 15 min, porque son solo 10⁶ combinaciones. Login con el mismo mensaje para "correo inexistente" y "contraseña incorrecta" y con comparación bcrypt en ambos casos (sin enumeración de usuarios). |
| **DoS a nivel de aplicación** | Tope general de 600 peticiones por IP cada 15 min, tope propio para registro, formulario de contacto y chat de IA (20/min, cada consulta cuesta una llamada a Groq), cuerpo máximo de 50 kb, contraseña máxima de 72 caracteres (bcrypt) y timeout de 30 s por petición contra conexiones lentas. Los límites son en memoria: sirven para una instancia; con varias habría que moverlos a Redis. Un ataque volumétrico de red lo absorbe la infraestructura de Render y Vercel, no este código. |
| **Fuga de información** | Los errores 500 devuelven un mensaje genérico (el detalle queda en el log). `GET /api/lugares/:id` ya no incluye al negocio dueño y solo devuelve lugares aprobados. Rutas inexistentes y JSON inválido responden 404/400 sin trazas. |
| **Acceso no autorizado** | `authMiddleware` exige un JWT válido (algoritmo HS256 fijado); `adminMiddleware` re-consulta en la base que la cuenta tenga `esAdmin: true` (no confía en el contenido del token). El registro público no puede crear administradores. |
| **Orígenes no autorizados** | CORS con lista de orígenes (`CORS_ORIGINS`); `helmet` agrega HSTS, `nosniff` y demás cabeceras de seguridad. |
| **Robo de credenciales** | Contraseñas con `bcrypt`; autenticación en dos factores TOTP (`speakeasy`) obligatoria; el JWT vence a las 8 horas. |
| **Manipulación de la IA** | La consulta del turista tiene tope de 500 caracteres y la respuesta del modelo se filtra: solo se devuelven rutas que existen en el catálogo, con textos de largo acotado. |

**Limitaciones conocidas:** el paso de 2FA recibe el `negocioId` que devuelve el login, no un token temporal firmado (el límite por cuenta mitiga el abuso, pero un token de "paso 1" sería lo ideal); los límites de peticiones son por instancia; y no hay una suite de pruebas automatizadas, por lo que las defensas se verificaron manualmente con peticiones de ataque contra la API.

---

## Contribuciones

Flujo de trabajo: rama por feature (`feat/nombre-descriptivo`), commits siguiendo [Conventional Commits](https://www.conventionalcommits.org/) (`feat:`, `fix:`, `chore:`, etc.) y Pull Request hacia `main` para mantener trazabilidad y revisión antes de mergear.

## Licencia

ISC — proyecto desarrollado con fines académicos para el Hackathon Nicaragua 2026.
