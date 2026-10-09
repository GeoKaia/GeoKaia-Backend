const { prisma } = require('../db');
const { responderError } = require('../utils/errores');
const auditoria = require('../services/auditoria');
const correo = require('../utils/correo');

// Canal oficial de comunicación entre el equipo de GeoKaia y cada negocio. En lugar de que un administrador modifique
// el perfil de otra persona, abre una conversación vinculada al negocio y le explica qué mejorar; el propietario decide
// qué responder y corrige su propio perfil desde su cuenta.
//
//  - Cada conversación pertenece a UN negocio (negocioId). El propietario solo ve las suyas: con el id de la de otro
//    negocio la respuesta es un 404 idéntico al de una conversación inexistente (no se puede ni confirmar que existe).
//  - Los mensajes no se editan ni se borran (historial). Cada uno guarda remitente, rol, fecha y hora, y cuándo lo leyó
//    el destinatario ("Enviado" / "Leído").
//  - Estados de la conversación: ABIERTA, EN_SEGUIMIENTO y RESUELTA.
//  - Que un administrador lea una conversación privada queda en el historial de auditoría.

const SNIPPET = 140;

const dtoMensaje = (m) => ({
  id: m.id,
  autorRol: m.autorRol, // ADMIN | PROPIETARIO | SISTEMA
  autorNombre: m.autorRol === 'ADMIN' ? 'Equipo GeoKaia' : m.autorNombre, // al negocio no se le muestra el nombre ni el correo del admin
  texto: m.texto,
  creadoEn: m.creadoEn,
  estado: m.leidoEn ? 'LEIDO' : 'ENVIADO',
  leidoEn: m.leidoEn,
});

const dtoMensajeParaAdmin = (m) => ({ ...dtoMensaje(m), autorNombre: m.autorNombre, autorId: m.autorId });

function resumen(c, noLeidos, ultimo) {
  return {
    id: c.id,
    asunto: c.asunto,
    estado: c.estado,
    lugarId: c.lugarId,
    lugarNombre: c.lugarNombre,
    creadaEn: c.creadaEn,
    actualizadaEn: c.actualizadaEn,
    noLeidos,
    ultimoMensaje: ultimo ? { texto: ultimo.texto.slice(0, SNIPPET), autorRol: ultimo.autorRol, creadoEn: ultimo.creadoEn } : null,
  };
}

async function nombreDe(negocioId) {
  return (await prisma.negocio.findUnique({ where: { id: negocioId }, select: { nombreContacto: true } }))?.nombreContacto ?? 'Administrador';
}

// ----------------------------------------------------------------------------------------------- administradores

exports.crear = async (req, res) => {
  const { lugarId, asunto, texto } = req.body;
  try {
    const lugar = await prisma.lugar.findUnique({ where: { id: lugarId }, select: { id: true, nombre: true } });
    const dueno = lugar ? await prisma.negocio.findFirst({ where: { lugarId: lugar.id }, select: { id: true, email: true, nombreContacto: true } }) : null;
    if (!lugar) return res.status(404).json({ error: 'Lugar no encontrado' });
    if (!dueno) return res.status(400).json({ error: 'Este lugar no tiene un negocio propietario con quien conversar' });

    const conv = await prisma.$transaction(async (tx) => {
      const c = await tx.conversacion.create({
        data: { lugarId: lugar.id, lugarNombre: lugar.nombre, negocioId: dueno.id, asunto, creadaPorId: req.negocio.id },
      });
      await tx.mensaje.create({ data: { conversacionId: c.id, autorId: req.negocio.id, autorRol: 'ADMIN', autorNombre: await nombreDe(req.negocio.id), texto } });
      return c;
    });
    await auditoria.registrar({ req, accion: 'conversacion.crear', recurso: { tipo: 'Conversacion', id: conv.id }, negocioAfectadoId: dueno.id, detalle: { lugarId: lugar.id, asunto } });
    avisarPorCorreo(dueno.email);
    res.status(201).json({ mensaje: 'Conversación creada', conversacion: resumen(conv, 0, { texto, autorRol: 'ADMIN', creadoEn: conv.creadaEn }) });
  } catch (err) {
    responderError(res, err, 'Error al crear la conversación');
  }
};

exports.listarAdmin = async (req, res) => {
  try {
    const { estado, lugarId, negocioId } = req.consulta || {};
    const convs = await prisma.conversacion.findMany({
      where: { ...(estado ? { estado } : {}), ...(lugarId ? { lugarId } : {}), ...(negocioId ? { negocioId } : {}) },
      orderBy: { actualizadaEn: 'desc' },
      take: 100,
      include: {
        negocio: { select: { nombreContacto: true } },
        mensajes: { orderBy: { creadoEn: 'desc' }, take: 1 },
        _count: { select: { mensajes: { where: { autorRol: 'PROPIETARIO', leidoEn: null } } } },
      },
    });
    res.json(convs.map((c) => ({ ...resumen(c, c._count.mensajes, c.mensajes[0]), negocio: c.negocio ? { nombreContacto: c.negocio.nombreContacto } : null })));
  } catch (err) {
    responderError(res, err, 'Error al listar las conversaciones');
  }
};

exports.verAdmin = async (req, res) => {
  try {
    const c = await prisma.conversacion.findUnique({ where: { id: Number(req.params.id) }, include: { mensajes: { orderBy: { creadoEn: 'asc' } }, negocio: { select: { nombreContacto: true } } } });
    if (!c) return res.status(404).json({ error: 'Conversación no encontrada' });
    await prisma.mensaje.updateMany({ where: { conversacionId: c.id, autorRol: 'PROPIETARIO', leidoEn: null }, data: { leidoEn: new Date() } });
    await auditoria.registrar({ req, accion: 'conversacion.ver', recurso: { tipo: 'Conversacion', id: c.id }, negocioAfectadoId: c.negocioId });
    res.json({ ...resumen(c, 0, c.mensajes.at(-1)), negocio: c.negocio ? { nombreContacto: c.negocio.nombreContacto } : null, mensajes: c.mensajes.map(dtoMensajeParaAdmin) });
  } catch (err) {
    responderError(res, err, 'Error al obtener la conversación');
  }
};

exports.responderAdmin = async (req, res) => {
  try {
    const c = await prisma.conversacion.findUnique({ where: { id: Number(req.params.id) }, include: { negocio: { select: { email: true } } } });
    if (!c) return res.status(404).json({ error: 'Conversación no encontrada' });
    const m = await prisma.$transaction(async (tx) => {
      const nuevo = await tx.mensaje.create({ data: { conversacionId: c.id, autorId: req.negocio.id, autorRol: 'ADMIN', autorNombre: await nombreDe(req.negocio.id), texto: req.body.texto } });
      await tx.conversacion.update({ where: { id: c.id }, data: { actualizadaEn: new Date(), ...(c.estado === 'RESUELTA' ? { estado: 'ABIERTA' } : {}) } });
      return nuevo;
    });
    await auditoria.registrar({ req, accion: 'conversacion.mensaje_admin', recurso: { tipo: 'Conversacion', id: c.id }, negocioAfectadoId: c.negocioId });
    if (c.negocio?.email) avisarPorCorreo(c.negocio.email);
    res.status(201).json({ mensaje: dtoMensajeParaAdmin(m) });
  } catch (err) {
    responderError(res, err, 'Error al enviar el mensaje');
  }
};

exports.estadoAdmin = async (req, res) => {
  try {
    const c = await prisma.conversacion.findUnique({ where: { id: Number(req.params.id) } });
    if (!c) return res.status(404).json({ error: 'Conversación no encontrada' });
    await prisma.conversacion.update({ where: { id: c.id }, data: { estado: req.body.estado, actualizadaEn: new Date() } });
    await auditoria.registrar({ req, accion: 'conversacion.estado', recurso: { tipo: 'Conversacion', id: c.id }, negocioAfectadoId: c.negocioId, detalle: { de: c.estado, a: req.body.estado } });
    res.json({ mensaje: 'Estado actualizado', estado: req.body.estado });
  } catch (err) {
    responderError(res, err, 'Error al cambiar el estado');
  }
};

exports.noLeidosAdmin = async (req, res) => {
  try {
    const total = await prisma.mensaje.count({ where: { autorRol: 'PROPIETARIO', leidoEn: null } });
    const abiertas = await prisma.conversacion.count({ where: { estado: { not: 'RESUELTA' } } });
    res.json({ noLeidos: total, conversacionesAbiertas: abiertas });
  } catch (err) {
    responderError(res, err);
  }
};

// ----------------------------------------------------------------------------------------------- propietario

// Todas las consultas del propietario filtran por SU negocioId (el de la sesión), nunca por un id que mande el cliente.

exports.listarPropias = async (req, res) => {
  try {
    const convs = await prisma.conversacion.findMany({
      where: { negocioId: req.negocio.id },
      orderBy: { actualizadaEn: 'desc' },
      take: 100,
      include: {
        mensajes: { orderBy: { creadoEn: 'desc' }, take: 1 },
        _count: { select: { mensajes: { where: { autorRol: { in: ['ADMIN', 'SISTEMA'] }, leidoEn: null } } } },
      },
    });
    res.json(convs.map((c) => resumen(c, c._count.mensajes, c.mensajes[0])));
  } catch (err) {
    responderError(res, err, 'Error al listar tus conversaciones');
  }
};

exports.verPropia = async (req, res) => {
  try {
    const c = await prisma.conversacion.findFirst({ where: { id: Number(req.params.id), negocioId: req.negocio.id }, include: { mensajes: { orderBy: { creadoEn: 'asc' } } } });
    if (!c) {
      // Si existe pero es de otro negocio, se deja constancia: es un intento de acceso a datos ajenos (IDOR).
      const existe = await prisma.conversacion.findUnique({ where: { id: Number(req.params.id) }, select: { negocioId: true } });
      if (existe) await auditoria.registrar({ req, accion: 'acceso.denegado_recurso', resultado: 'DENEGADO', recurso: { tipo: 'Conversacion', id: req.params.id }, negocioAfectadoId: existe.negocioId });
      return res.status(404).json({ error: 'Conversación no encontrada' });
    }
    await prisma.mensaje.updateMany({ where: { conversacionId: c.id, autorRol: { in: ['ADMIN', 'SISTEMA'] }, leidoEn: null }, data: { leidoEn: new Date() } });
    res.json({ ...resumen(c, 0, c.mensajes.at(-1)), mensajes: c.mensajes.map(dtoMensaje) });
  } catch (err) {
    responderError(res, err, 'Error al obtener la conversación');
  }
};

async function buscarPropia(req, res) {
  const c = await prisma.conversacion.findFirst({ where: { id: Number(req.params.id), negocioId: req.negocio.id } });
  if (!c) {
    const existe = await prisma.conversacion.findUnique({ where: { id: Number(req.params.id) }, select: { negocioId: true } });
    if (existe) await auditoria.registrar({ req, accion: 'acceso.denegado_recurso', resultado: 'DENEGADO', recurso: { tipo: 'Conversacion', id: req.params.id }, negocioAfectadoId: existe.negocioId });
    res.status(404).json({ error: 'Conversación no encontrada' });
    return null;
  }
  return c;
}

exports.responderPropia = async (req, res) => {
  try {
    const c = await buscarPropia(req, res);
    if (!c) return;
    const m = await prisma.$transaction(async (tx) => {
      const nuevo = await tx.mensaje.create({ data: { conversacionId: c.id, autorId: req.negocio.id, autorRol: 'PROPIETARIO', autorNombre: await nombreDe(req.negocio.id), texto: req.body.texto } });
      await tx.conversacion.update({ where: { id: c.id }, data: { actualizadaEn: new Date(), ...(c.estado === 'RESUELTA' ? { estado: 'ABIERTA' } : {}) } });
      return nuevo;
    });
    await auditoria.registrar({ req, accion: 'conversacion.mensaje_propietario', recurso: { tipo: 'Conversacion', id: c.id }, negocioAfectadoId: req.negocio.id });
    res.status(201).json({ mensaje: dtoMensaje(m) });
  } catch (err) {
    responderError(res, err, 'Error al enviar el mensaje');
  }
};

// El propietario solo puede marcar la conversación como resuelta o reabrirla; "En seguimiento" lo pone el equipo.
exports.estadoPropio = async (req, res) => {
  try {
    const c = await buscarPropia(req, res);
    if (!c) return;
    await prisma.conversacion.update({ where: { id: c.id }, data: { estado: req.body.estado, actualizadaEn: new Date() } });
    await auditoria.registrar({ req, accion: 'conversacion.estado', recurso: { tipo: 'Conversacion', id: c.id }, negocioAfectadoId: req.negocio.id, detalle: { de: c.estado, a: req.body.estado } });
    res.json({ mensaje: 'Estado actualizado', estado: req.body.estado });
  } catch (err) {
    responderError(res, err, 'Error al cambiar el estado');
  }
};

exports.noLeidosPropios = async (req, res) => {
  try {
    const noLeidos = await prisma.mensaje.count({ where: { autorRol: { in: ['ADMIN', 'SISTEMA'] }, leidoEn: null, conversacion: { negocioId: req.negocio.id } } });
    res.json({ noLeidos });
  } catch (err) {
    responderError(res, err);
  }
};

// Aviso por correo (si hay SMTP configurado) sin el contenido del mensaje: solo que hay algo nuevo en su panel.
function avisarPorCorreo(email) {
  const base = (process.env.FRONTEND_URL || 'http://localhost:3000').replace(/\/$/, '');
  correo
    .enviar({ para: email, asunto: 'Tenés un mensaje nuevo del equipo de GeoKaia', texto: `El equipo de GeoKaia te escribió sobre tu negocio. Leelo y respondé desde tu panel: ${base}/panel-negocio/mensajes` })
    .catch(() => {});
}

exports._avisarPorCorreo = avisarPorCorreo;
