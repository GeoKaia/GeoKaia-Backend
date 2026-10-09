// Cookie de sesión. La sesión vive en el SERVIDOR (tabla "Sesion", ver services/sesiones.js); la cookie solo lleva un
// identificador aleatorio de 256 bits, sin datos del usuario ni permisos: nada que se pueda editar o inventar en F12.
//  - HttpOnly  : JavaScript no la lee (protege frente a XSS).
//  - Secure    : solo por HTTPS (producción). Con Secure se usa el prefijo __Host-, que además obliga a Path=/ y sin
//                Domain: ningún subdominio puede pisarla.
//  - SameSite  : Lax. Strict rompería los enlaces que llegan desde fuera (por ejemplo desde un correo) y Lax ya
//                bloquea el envío en POST/PATCH/DELETE iniciados por otro sitio; el servidor verifica además el
//                Origin de cada escritura (ver index.js).
//  - Path=/ y sin Domain: la cookie es del host exacto que la fijó.
//  - Max-Age   : igual a la duración máxima de la sesión. Las cuentas de administrador usan cookie de sesión del
//                navegador (sin Max-Age): se borra al cerrar el navegador.
const esSegura = () => (process.env.COOKIE_SECURE ? process.env.COOKIE_SECURE === 'true' : process.env.NODE_ENV === 'production');

const nombreCookie = () => (esSegura() ? '__Host-gk_sesion' : 'gk_sesion');

const opciones = () => ({ httpOnly: true, secure: esSegura(), sameSite: 'lax', path: '/' });

exports.nombreCookie = nombreCookie;

exports.fijarCookie = (res, token, { maxAgeMs } = {}) =>
  res.cookie(nombreCookie(), token, maxAgeMs ? { ...opciones(), maxAge: maxAgeMs } : opciones());

exports.borrarCookie = (res) => res.clearCookie(nombreCookie(), opciones());

// Lee una cookie a mano para no sumar una dependencia solo por esto.
exports.leerCookie = (req, nombre = nombreCookie()) => {
  const crudo = req.headers.cookie;
  if (!crudo) return null;
  for (const par of crudo.split(';')) {
    const i = par.indexOf('=');
    if (i === -1) continue;
    if (par.slice(0, i).trim() === nombre) {
      try {
        return decodeURIComponent(par.slice(i + 1).trim());
      } catch {
        return null;
      }
    }
  }
  return null;
};
