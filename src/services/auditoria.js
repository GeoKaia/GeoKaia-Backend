const crypto = require('crypto');
const { prisma } = require('../db');

// Historial de auditoría. Tres defensas para que no se pueda alterar sin que se note:
//  1. La base rechaza UPDATE, DELETE y TRUNCATE sobre "Auditoria" con un trigger (ver la migración): ni siquiera el
//     usuario de la aplicación puede modificar o borrar un registro.
//  2. Cada registro lleva el hash SHA-256 del anterior ("cadena"): si alguien con acceso privilegiado a la base
//     desactiva el trigger y cambia o inserta filas, verificarCadena() lo detecta.
//  3. Nunca se guardan contraseñas, tokens, códigos 2FA ni cookies: limpiar() los descarta antes de escribir.

const CLAVE_BLOQUEO = 727001; // pg_advisory_xact_lock: serializa las escrituras para que la cadena sea lineal
const CLAVES_SENSIBLES = /pass|contrasena|token|secret|codigo|cookie|authorization|totp/i;

function limpiar(valor, profundidad = 0) {
  if (valor === null || valor === undefined) return null;
  if (typeof valor === 'string') return valor.length > 500 ? valor.slice(0, 500) + '…' : valor;
  if (typeof valor === 'number' || typeof valor === 'boolean') return valor;
  if (profundidad >= 4) return '[omitido]';
  if (Array.isArray(valor)) return valor.slice(0, 20).map((v) => limpiar(v, profundidad + 1));
  if (typeof valor === 'object') {
    const salida = {};
    for (const [k, v] of Object.entries(valor)) salida[k] = CLAVES_SENSIBLES.test(k) ? '[omitido]' : limpiar(v, profundidad + 1);
    return salida;
  }
  return String(valor);
}

// JSON canónico (claves ordenadas): el mismo contenido siempre produce el mismo texto, sin importar el orden con el
// que la base devuelva las claves.
function estable(valor) {
  if (valor === null || valor === undefined) return 'null';
  if (typeof valor !== 'object') return JSON.stringify(valor);
  if (Array.isArray(valor)) return '[' + valor.map(estable).join(',') + ']';
  return '{' + Object.keys(valor).sort().map((k) => JSON.stringify(k) + ':' + estable(valor[k])).join(',') + '}';
}

function calcularHash(hashPrevio, r) {
  const contenido = estable({
    previo: hashPrevio || '',
    creadaEn: new Date(r.creadaEn).toISOString(),
    actorId: r.actorId ?? null,
    actorEmail: r.actorEmail ?? null,
    actorRol: r.actorRol ?? null,
    accion: r.accion,
    recursoTipo: r.recursoTipo ?? null,
    recursoId: r.recursoId ?? null,
    negocioAfectadoId: r.negocioAfectadoId ?? null,
    resultado: r.resultado,
    ip: r.ip ?? null,
    userAgent: r.userAgent ?? null,
    detalle: r.detalle ?? null,
  });
  return crypto.createHash('sha256').update(contenido).digest('hex');
}

function rolDe(actor) {
  if (!actor) return 'ANONIMO';
  return actor.esAdmin ? 'ADMIN' : 'PROPIETARIO';
}

// Registra una acción. Nunca lanza: una falla de auditoría se escribe en el log del servidor pero no tumba la
// operación del usuario.
//   req                 petición (de ahí salen IP y navegador)
//   actor               { id, email, esAdmin } de quien actúa; si no se pasa se toma de req.negocio
//   accion              "dominio.accion", por ejemplo "sesion.login_fallido"
//   recurso             { tipo, id } sobre lo que se actúa
//   negocioAfectadoId   dueño del recurso, para poder buscar "todo lo que pasó con este negocio"
//   resultado           OK | DENEGADO | FALLO
//   detalle             datos extra (se limpian: sin contraseñas ni tokens)
async function registrar({ req, actor, accion, recurso, negocioAfectadoId, lugarId, resultado = 'OK', detalle }) {
  try {
    // Si se indica el lugar y no el dueño, se busca quién es el dueño (para poder consultar "todo lo de este negocio").
    if (negocioAfectadoId === undefined && lugarId) {
      negocioAfectadoId = (await prisma.negocio.findUnique({ where: { lugarId }, select: { id: true } }))?.id ?? null;
    }
    const a = actor === undefined ? req?.negocio || null : actor;
    const datos = {
      creadaEn: new Date(),
      actorId: a?.id ?? null,
      actorEmail: a?.email ?? null,
      actorRol: rolDe(a),
      accion,
      recursoTipo: recurso?.tipo ?? null,
      recursoId: recurso?.id !== undefined && recurso?.id !== null ? String(recurso.id) : null,
      negocioAfectadoId: negocioAfectadoId ?? null,
      resultado,
      ip: req?.ip ?? null,
      userAgent: req?.headers?.['user-agent'] ? String(req.headers['user-agent']).slice(0, 300) : null,
      detalle: detalle ? limpiar(detalle) : null,
    };
    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${CLAVE_BLOQUEO})`;
      const ultimo = await tx.auditoria.findFirst({ orderBy: { id: 'desc' }, select: { hash: true } });
      const hashPrevio = ultimo?.hash ?? null;
      const hash = calcularHash(hashPrevio, datos);
      await tx.auditoria.create({ data: { ...datos, detalle: datos.detalle ?? undefined, hashPrevio, hash } });
    });
  } catch (err) {
    console.error('[auditoría] no se pudo registrar', accion, '-', err.message);
  }
}

// Recorre toda la cadena y comprueba que ningún registro fue modificado, quitado o intercalado.
async function verificarCadena() {
  let ultimoId = 0;
  let hashEsperado = null;
  let total = 0;
  for (;;) {
    const filas = await prisma.auditoria.findMany({ where: { id: { gt: ultimoId } }, orderBy: { id: 'asc' }, take: 500 });
    if (filas.length === 0) break;
    for (const f of filas) {
      if ((f.hashPrevio ?? null) !== hashEsperado) {
        return { ok: false, total, primeraRotaId: f.id, motivo: 'La cadena de hashes se interrumpe: falta o sobra un registro anterior' };
      }
      if (calcularHash(f.hashPrevio, f) !== f.hash) {
        return { ok: false, total, primeraRotaId: f.id, motivo: 'El contenido del registro no coincide con su hash: fue modificado' };
      }
      hashEsperado = f.hash;
      ultimoId = f.id;
      total++;
    }
  }
  return { ok: true, total };
}

async function listar({ accion, resultado, actorId, negocioId, desde, hasta, antes, limite = 50 }) {
  const where = {};
  if (accion) where.accion = { startsWith: accion };
  if (resultado) where.resultado = resultado;
  if (actorId) where.actorId = actorId;
  if (negocioId) where.negocioAfectadoId = negocioId;
  if (desde || hasta) where.creadaEn = { ...(desde ? { gte: desde } : {}), ...(hasta ? { lte: hasta } : {}) };
  if (antes) where.id = { lt: antes };
  return prisma.auditoria.findMany({
    where,
    orderBy: { id: 'desc' },
    take: Math.min(Math.max(limite, 1), 200),
    select: { id: true, creadaEn: true, actorId: true, actorEmail: true, actorRol: true, accion: true, recursoTipo: true, recursoId: true, negocioAfectadoId: true, resultado: true, ip: true, detalle: true },
  });
}

module.exports = { registrar, verificarCadena, listar, limpiar, calcularHash };
