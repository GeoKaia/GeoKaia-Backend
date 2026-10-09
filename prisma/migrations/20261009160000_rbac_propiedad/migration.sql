-- Los comentarios sueltos del admin se reemplazan por el módulo de conversaciones (siguiente migración) y se elimina la
-- edición de lugares ajenos. Rol nuevo: administrador "responsable" (autoriza escalamientos).
DROP TABLE "ComentarioAdmin";

-- AlterTable
ALTER TABLE "Negocio" ADD COLUMN "esResponsable" BOOLEAN NOT NULL DEFAULT false;
