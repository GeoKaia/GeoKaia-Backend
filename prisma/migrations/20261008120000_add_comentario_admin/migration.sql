-- CreateTable
CREATE TABLE "ComentarioAdmin" (
    "id" SERIAL NOT NULL,
    "lugarId" INTEGER NOT NULL,
    "autorEmail" TEXT NOT NULL,
    "texto" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ComentarioAdmin_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ComentarioAdmin_lugarId_idx" ON "ComentarioAdmin"("lugarId");

-- AddForeignKey
ALTER TABLE "ComentarioAdmin" ADD CONSTRAINT "ComentarioAdmin_lugarId_fkey" FOREIGN KEY ("lugarId") REFERENCES "Lugar"("id") ON DELETE CASCADE ON UPDATE CASCADE;
