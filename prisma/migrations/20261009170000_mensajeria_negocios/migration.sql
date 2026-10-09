-- CreateEnum
CREATE TYPE "EstadoConversacion" AS ENUM ('ABIERTA', 'EN_SEGUIMIENTO', 'RESUELTA');

-- CreateTable
CREATE TABLE "Conversacion" (
    "id" SERIAL NOT NULL,
    "lugarId" INTEGER,
    "lugarNombre" TEXT NOT NULL,
    "negocioId" INTEGER,
    "asunto" TEXT NOT NULL,
    "estado" "EstadoConversacion" NOT NULL DEFAULT 'ABIERTA',
    "creadaPorId" INTEGER NOT NULL,
    "creadaEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizadaEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Conversacion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Mensaje" (
    "id" SERIAL NOT NULL,
    "conversacionId" INTEGER NOT NULL,
    "autorId" INTEGER,
    "autorRol" TEXT NOT NULL,
    "autorNombre" TEXT NOT NULL,
    "texto" TEXT NOT NULL,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leidoEn" TIMESTAMP(3),

    CONSTRAINT "Mensaje_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Conversacion_negocioId_actualizadaEn_idx" ON "Conversacion"("negocioId", "actualizadaEn");

-- CreateIndex
CREATE INDEX "Conversacion_estado_actualizadaEn_idx" ON "Conversacion"("estado", "actualizadaEn");

-- CreateIndex
CREATE INDEX "Mensaje_conversacionId_creadoEn_idx" ON "Mensaje"("conversacionId", "creadoEn");

-- AddForeignKey
ALTER TABLE "Conversacion" ADD CONSTRAINT "Conversacion_lugarId_fkey" FOREIGN KEY ("lugarId") REFERENCES "Lugar"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Conversacion" ADD CONSTRAINT "Conversacion_negocioId_fkey" FOREIGN KEY ("negocioId") REFERENCES "Negocio"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Mensaje" ADD CONSTRAINT "Mensaje_conversacionId_fkey" FOREIGN KEY ("conversacionId") REFERENCES "Conversacion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Historial de mensajes: no se editan ni se borran. Lo único que puede cambiar en un mensaje es la marca de lectura.
CREATE FUNCTION "mensaje_inmutable"() RETURNS trigger AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'Los mensajes no se pueden borrar (historial)';
    END IF;
    IF NEW."texto" IS DISTINCT FROM OLD."texto"
       OR NEW."autorId" IS DISTINCT FROM OLD."autorId"
       OR NEW."autorRol" IS DISTINCT FROM OLD."autorRol"
       OR NEW."autorNombre" IS DISTINCT FROM OLD."autorNombre"
       OR NEW."creadoEn" IS DISTINCT FROM OLD."creadoEn"
       OR NEW."conversacionId" IS DISTINCT FROM OLD."conversacionId" THEN
        RAISE EXCEPTION 'Los mensajes no se pueden editar (historial): solo se puede marcar como leído';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "Mensaje_proteger_historial"
    BEFORE UPDATE OR DELETE ON "Mensaje"
    FOR EACH ROW EXECUTE FUNCTION "mensaje_inmutable"();
