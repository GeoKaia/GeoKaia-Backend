-- CreateEnum
CREATE TYPE "EstadoLugar" AS ENUM ('PENDIENTE', 'APROBADO', 'RECHAZADO');

-- AlterTable
ALTER TABLE "Lugar" ADD COLUMN     "estado" "EstadoLugar" NOT NULL DEFAULT 'APROBADO';

-- AlterTable
ALTER TABLE "Negocio" ADD COLUMN     "esAdmin" BOOLEAN NOT NULL DEFAULT false;
