-- CreateTable
CREATE TABLE "RestablecerPassword" (
    "id" SERIAL NOT NULL,
    "negocioId" INTEGER NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiraEn" TIMESTAMP(3) NOT NULL,
    "usadoEn" TIMESTAMP(3),
    "intentos" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RestablecerPassword_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RestablecerPassword_tokenHash_key" ON "RestablecerPassword"("tokenHash");

-- CreateIndex
CREATE INDEX "RestablecerPassword_negocioId_idx" ON "RestablecerPassword"("negocioId");

-- AddForeignKey
ALTER TABLE "RestablecerPassword" ADD CONSTRAINT "RestablecerPassword_negocioId_fkey" FOREIGN KEY ("negocioId") REFERENCES "Negocio"("id") ON DELETE CASCADE ON UPDATE CASCADE;
