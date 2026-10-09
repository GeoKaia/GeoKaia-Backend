-- CreateTable
CREATE TABLE "Auditoria" (
    "id" SERIAL NOT NULL,
    "creadaEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actorId" INTEGER,
    "actorEmail" TEXT,
    "actorRol" TEXT,
    "accion" TEXT NOT NULL,
    "recursoTipo" TEXT,
    "recursoId" TEXT,
    "negocioAfectadoId" INTEGER,
    "resultado" TEXT NOT NULL,
    "ip" TEXT,
    "userAgent" TEXT,
    "detalle" JSONB,
    "hashPrevio" TEXT,
    "hash" TEXT NOT NULL,

    CONSTRAINT "Auditoria_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Auditoria_accion_creadaEn_idx" ON "Auditoria"("accion", "creadaEn");

-- CreateIndex
CREATE INDEX "Auditoria_actorId_idx" ON "Auditoria"("actorId");

-- CreateIndex
CREATE INDEX "Auditoria_negocioAfectadoId_idx" ON "Auditoria"("negocioAfectadoId");

-- Historial de solo anexado: la base rechaza modificar o borrar registros, aunque la orden venga de la aplicación.
CREATE FUNCTION "auditoria_solo_anexar"() RETURNS trigger AS $$
BEGIN
    RAISE EXCEPTION 'La tabla Auditoria es de solo anexado: no se permite % sobre ella', TG_OP;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "Auditoria_bloquear_update_delete"
    BEFORE UPDATE OR DELETE ON "Auditoria"
    FOR EACH ROW EXECUTE FUNCTION "auditoria_solo_anexar"();

CREATE TRIGGER "Auditoria_bloquear_truncate"
    BEFORE TRUNCATE ON "Auditoria"
    FOR EACH STATEMENT EXECUTE FUNCTION "auditoria_solo_anexar"();
