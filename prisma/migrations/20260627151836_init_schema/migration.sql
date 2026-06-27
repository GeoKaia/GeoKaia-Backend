-- CreateEnum
CREATE TYPE "Categoria" AS ENUM ('GASTRONOMIA', 'CULTURA', 'NATURALEZA', 'HISTORIA', 'ARTESANIA');

-- CreateEnum
CREATE TYPE "Tier" AS ENUM ('GRATIS', 'PREMIUM');

-- CreateTable
CREATE TABLE "Lugar" (
    "id" SERIAL NOT NULL,
    "nombre" TEXT NOT NULL,
    "descripcion" TEXT NOT NULL,
    "categoria" "Categoria" NOT NULL,
    "tier" "Tier" NOT NULL DEFAULT 'GRATIS',
    "latitud" DOUBLE PRECISION NOT NULL,
    "longitud" DOUBLE PRECISION NOT NULL,
    "horarios" TEXT,
    "fotoUrl" TEXT,
    "panoramaUrl" TEXT,
    "videoUrl" TEXT,
    "galeriaUrls" TEXT[],
    "whatsapp" TEXT,
    "menuUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Lugar_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Ruta" (
    "id" SERIAL NOT NULL,
    "nombre" TEXT NOT NULL,
    "categoria" TEXT NOT NULL,
    "descripcion" TEXT NOT NULL,
    "descripcionParaIA" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Ruta_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ParadaRuta" (
    "id" SERIAL NOT NULL,
    "rutaId" INTEGER NOT NULL,
    "lugarId" INTEGER NOT NULL,
    "orden" INTEGER NOT NULL,
    "minutosAlSiguiente" INTEGER,

    CONSTRAINT "ParadaRuta_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Lead" (
    "id" SERIAL NOT NULL,
    "nombreNegocio" TEXT NOT NULL,
    "nombreContacto" TEXT NOT NULL,
    "whatsapp" TEXT NOT NULL,
    "mensaje" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Lead_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Negocio" (
    "id" SERIAL NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "nombreContacto" TEXT NOT NULL,
    "whatsapp" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lugarId" INTEGER,

    CONSTRAINT "Negocio_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Negocio_email_key" ON "Negocio"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Negocio_lugarId_key" ON "Negocio"("lugarId");

-- AddForeignKey
ALTER TABLE "ParadaRuta" ADD CONSTRAINT "ParadaRuta_rutaId_fkey" FOREIGN KEY ("rutaId") REFERENCES "Ruta"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ParadaRuta" ADD CONSTRAINT "ParadaRuta_lugarId_fkey" FOREIGN KEY ("lugarId") REFERENCES "Lugar"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Negocio" ADD CONSTRAINT "Negocio_lugarId_fkey" FOREIGN KEY ("lugarId") REFERENCES "Lugar"("id") ON DELETE SET NULL ON UPDATE CASCADE;
