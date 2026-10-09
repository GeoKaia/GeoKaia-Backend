const auditoria = require('../services/auditoria');
const { rolDe } = require('./roles');
const { responderError } = require('../utils/errores');

// Control de acceso basado en roles y permisos (RBAC). TODA decisión se toma en el servidor, en cada petición, con el
// rol que está en la base de datos (auth.middleware lo carga junto con la sesión). Nada que mande el navegador (botones
// ocultos, variables, cookies, cabeceras, parámetros) puede dar un permiso.
//
// Principio de mínimo privilegio: cada rol tiene SOLO los permisos que necesita.
//
//  PROPIETARIO  dueño de un negocio. Es el único que puede crear, editar y borrar la información de SU negocio.
//  ADMIN        equipo de GeoKaia. Supervisa y se comunica con los negocios, pero NO puede crear, editar ni borrar la
//               información comercial de un negocio ajeno. Modera la cola de aprobación (aprobar/rechazar lugares nuevos),
//               administra el contenido propio de la plataforma (rutas) y puede pedir un escalamiento.
//  RESPONSABLE  administrador con la facultad adicional de autorizar escalamientos (segunda persona del procedimiento
//               de excepción). Se asigna a mano en la base (Negocio.esResponsable); nunca por el registro.
const PERMISOS = {
  PROPIETARIO: [
    'lugar:crear_propio',
    'lugar:editar_propio',
    'lugar:borrar_propio',
    'cuenta:gestionar_propia',
    'mensajes:leer_propios',
    'mensajes:responder_propios',
  ],
  ADMIN: [
    'cuenta:gestionar_propia',
    'lugar:ver_todos', // solo lectura
    'lugar:moderar_nuevos', // aprobar o rechazar un lugar recién enviado (PENDIENTE)
    'ruta:gestionar', // contenido de la plataforma, no datos de un negocio
    'conversacion:gestionar', // abrir conversaciones con negocios, enviar observaciones, cambiar su estado
    'escalamiento:solicitar',
    'escalamiento:ver',
    'auditoria:ver',
    'sesion:revocar_cuenta', // medida de protección ante un incidente; no modifica datos
  ],
};
PERMISOS.RESPONSABLE = [...PERMISOS.ADMIN, 'escalamiento:autorizar'];

// Lo que NUNCA se concede a ningún rol sobre un negocio ajeno (documentado y verificado por las pruebas):
//   lugar:editar_ajeno, lugar:borrar_ajeno, cuenta:editar_ajena, cuenta:borrar_ajena.
// Las excepciones solo existen como escalamientos con tipo cerrado (ver controllers/escalamientos.controller.js).

function tienePermiso(negocio, permiso) {
  const rol = rolDe(negocio);
  return !!rol && PERMISOS[rol].includes(permiso);
}

// Middleware: exige el permiso. Va DESPUÉS de auth.middleware. Un intento denegado queda en el historial.
const requierePermiso = (permiso) => async (req, res, next) => {
  try {
    if (!tienePermiso(req.negocio, permiso)) {
      await auditoria.registrar({ req, accion: 'acceso.denegado', resultado: 'DENEGADO', detalle: { permiso, metodo: req.method, ruta: req.originalUrl.split('?')[0] } });
      return res.status(403).json({ error: 'No autorizado: tu rol no tiene permiso para esta operación' });
    }
    next();
  } catch (err) {
    responderError(res, err);
  }
};

module.exports = { PERMISOS, rolDe, tienePermiso, requierePermiso };
