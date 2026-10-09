-- CreateTable
CREATE TABLE "SesionRefresco" (
    "id" SERIAL NOT NULL,
    "negocioId" INTEGER NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiraEn" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SesionRefresco_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SesionRefresco_tokenHash_key" ON "SesionRefresco"("tokenHash");

-- CreateIndex
CREATE INDEX "SesionRefresco_negocioId_idx" ON "SesionRefresco"("negocioId");

-- AddForeignKey
ALTER TABLE "SesionRefresco" ADD CONSTRAINT "SesionRefresco_negocioId_fkey" FOREIGN KEY ("negocioId") REFERENCES "Negocio"("id") ON DELETE CASCADE ON UPDATE CASCADE;
