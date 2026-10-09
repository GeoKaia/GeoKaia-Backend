-- Las sesiones pasan a vivir en el servidor (tabla Sesion) y se elimina la cookie de dispositivo (SesionRefresco):
-- borrar la cookie desde el navegador ahora cierra la sesión, como corresponde.
DROP TABLE "SesionRefresco";

-- CreateTable
CREATE TABLE "Sesion" (
    "id" SERIAL NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "negocioId" INTEGER NOT NULL,
    "creadaEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ultimaActividad" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiraEn" TIMESTAMP(3) NOT NULL,
    "revocadaEn" TIMESTAMP(3),
    "motivoRevocacion" TEXT,
    "ip" TEXT,
    "userAgent" TEXT,

    CONSTRAINT "Sesion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Sesion_tokenHash_key" ON "Sesion"("tokenHash");

-- CreateIndex
CREATE INDEX "Sesion_negocioId_idx" ON "Sesion"("negocioId");

-- AddForeignKey
ALTER TABLE "Sesion" ADD CONSTRAINT "Sesion_negocioId_fkey" FOREIGN KEY ("negocioId") REFERENCES "Negocio"("id") ON DELETE CASCADE ON UPDATE CASCADE;
