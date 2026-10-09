const { prisma } = require('../db');
const { responderError } = require('../utils/errores');
const auditoria = require('../services/auditoria');
const sesiones = require('../services/sesiones');

// [Admin] Incidente de seguridad: cierra todas las sesiones activas de una cuenta (por ejemplo si se sospecha que
// alguien más entró). Es una medida de protección, no una edición: no cambia ningún dato de la cuenta ni del negocio.
exports.revocarSesiones = async (req, res) => {
  try {
    const id = Number(req.params.id);
    const cuenta = await prisma.negocio.findUnique({ where: { id }, select: { id: true } });
    if (!cuenta) return res.status(404).json({ error: 'Cuenta no encontrada' });
    const revocadas = await sesiones.revocarTodas(id, 'revocada_por_administrador');
    await auditoria.registrar({ req, accion: 'sesion.revocar_cuenta', recurso: { tipo: 'Negocio', id }, negocioAfectadoId: id, detalle: { revocadas } });
    res.json({ mensaje: 'Sesiones cerradas', revocadas });
  } catch (err) {
    responderError(res, err, 'Error al revocar las sesiones');
  }
};
