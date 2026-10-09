const { z } = require('zod');
const auditoria = require('../services/auditoria');
const { responderError } = require('../utils/errores');

const consultaSchema = z.object({
  accion: z.string().max(60).optional(), // prefijo: "sesion." trae todos los eventos de sesión
  resultado: z.enum(['OK', 'DENEGADO', 'FALLO']).optional(),
  actorId: z.coerce.number().int().positive().optional(),
  negocioId: z.coerce.number().int().positive().optional(),
  desde: z.coerce.date().optional(),
  hasta: z.coerce.date().optional(),
  antes: z.coerce.number().int().positive().optional(), // paginación: registros con id menor a este
  limite: z.coerce.number().int().min(1).max(200).optional(),
});

exports.listar = async (req, res) => {
  const p = consultaSchema.safeParse(req.query);
  if (!p.success) {
    return res.status(400).json({ error: 'Parámetros inválidos', detalles: p.error.issues.map((i) => ({ campo: i.path[0], mensaje: i.message })) });
  }
  try {
    const registros = await auditoria.listar(p.data);
    await auditoria.registrar({ req, accion: 'auditoria.consulta', detalle: { filtros: p.data } });
    res.json(registros);
  } catch (err) {
    responderError(res, err, 'Error al consultar el historial de auditoría');
  }
};

exports.verificar = async (req, res) => {
  try {
    const resultado = await auditoria.verificarCadena();
    await auditoria.registrar({ req, accion: 'auditoria.verificacion', resultado: resultado.ok ? 'OK' : 'FALLO', detalle: resultado });
    res.json(resultado);
  } catch (err) {
    responderError(res, err, 'Error al verificar el historial de auditoría');
  }
};
