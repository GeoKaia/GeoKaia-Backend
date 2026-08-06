-- AlterTable
ALTER TABLE "ParadaRuta" ADD COLUMN     "distanciaKm" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "Ruta" ADD COLUMN     "color" TEXT,
ADD COLUMN     "emoji" TEXT,
ADD COLUMN     "fotoUrl" TEXT;
