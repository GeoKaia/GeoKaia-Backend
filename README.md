# GeoKaia Backend

[![Known Vulnerabilities](https://snyk.io/test/github/GeoKaia/GeoKaia-Backend/badge.svg)](https://snyk.io/test/github/GeoKaia/GeoKaia-Backend)

API REST del sistema GeoKaia — Plataforma de turismo digital para Nicaragua.
Deployada en: https://geokaia-backend.onrender.com

# GeoKaia

> Plataforma interactiva de turismo creativo y cultural en Nicaragua que utiliza IA para recomendar rutas curadas y experiencias inmersivas 360°.

---

## Tabla de contenidos

- [Descripción general](#descripción-general)
- [Tecnologías usadas](#tecnologías-usadas)
- [Instalación](#instalación)
- [Ejecución](#ejecución)
- [Arquitectura del sistema — Avanzado](#arquitectura-del-sistema--avanzado)
- [Dependencias — Avanzado](#dependencias--avanzado)
- [Variables de entorno — Avanzado](#variables-de-entorno--avanzado)
- [Estructura modular — Avanzado](#estructura-modular--avanzado)
- [Endpoints de la API — Avanzado](#endpoints-de-la-api--avanzado)
- [Contribuciones](#contribuciones)
- [Licencia](#licencia)

---

## Descripción general

GeoKaia centraliza y optimiza la exploración turística en Nicaragua. Resuelve la fragmentación de la información cultural mediante un mapa interactivo (orientado a nodos creativos) y rutas temáticas curadas.

El sistema está diseñado para dos tipos de usuarios:
* Turistas (B2C): Acceden a exploración sin fricción sin login requerido, visualizan mapas con pines diferenciados y consultan un agente de IA que cruza sus preferencias con un catálogo de rutas preestablecidas.
* Negocios y MiPymes (B2B): A través de un modelo Freemium/Premium, los negocios pueden destacar en el mapa con pines especiales, visores inmersivos 360°, galerías multimedia y llamados a la acción directos.

---

## Tecnologías usadas

| Tecnología | Versión | Uso |
|---|---|---|
| React | 18.x | Framework principal para la construcción de interfaces de usuario |
| React-Leaflet | 4.x | Renderizado del mapa interactivo y capas vectoriales |
| MapTiler | N/A | Proveedor de tiles base con estilo visual moderno y personalizado |
| Pannellum | N/A | Visor inmersivo para panorámicas 360° de negocios premium |
| Node.js | 20.x | Entorno de ejecución para el servidor backend |
| Express.js | 4.x | Framework principal de la API REST |
| PostgreSQL | 15+ | Base de datos relacional principal alojada en Neon |
| Prisma ORM | 7.8 | Modelado de datos y consultas a la base de datos |
| Groq API | Llama3-8b | Agente de IA para recomendación de rutas turísticas |

---

## Instalación

Pasos para desplegar el entorno completo de desarrollo local, incluyendo backend y frontend.

**Requisitos previos:**

- Node.js >= 18
- Git
- Cuenta activa en Neon (PostgreSQL) y Groq (API Key)

**Pasos Backend:**

```bash
# 1. Clona el repositorio
git clone [https://github.com/](https://github.com/)[usuario]/GeoKaia-Backend.git
cd GeoKaia-Backend

# 2. Instala las dependencias
npm install

# 3. Configura las variables de entorno
cp .env.example .env
# Edita el archivo .env con tus credenciales

# 4. Sincroniza la base de datos y genera el cliente
npx prisma db push
npx prisma generate

[ Interfaz de Usuario / Frontend en React ]
  |-- Componentes Reutilizables (PlaceCard, RouteCard)
  |-- Módulo de Mapa (MapTiler + react-leaflet)
  |-- Visor 360 Inmersivo (Pannellum)
  |-- Interfaz de IA Conversacional
            |
            | (Peticiones HTTP / JSON)
            v
[ Enrutamiento y Seguridad / Backend en Express ]
  |-- Middleware de Autorización (JWT)
  |-- Agente Recomendador <--> [ Groq API / Llama3 ]
            |
[ Controladores (Lógica de negocio por entidad) ]
            |
[ Prisma ORM (Adapter-PG) ]
            |
[ PostgreSQL en Neon (Esquema Relacional 3FN) ]
