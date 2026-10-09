// Sesión por cookies httpOnly: el JWT ya no viaja por JavaScript (ni localStorage ni sessionStorage), así que un
// script inyectado (XSS) o alguien mirando F12 > Application no puede leerlo ni copiarlo.
//  - httpOnly: JavaScript no la ve.
//  - secure: solo por HTTPS (en producción).
//  - sameSite 'lax': el navegador no la manda en peticiones POST/PATCH/DELETE iniciadas desde otro sitio (CSRF).
//
// Son DOS cookies, para que quitar una sola desde F12 no cierre la sesión:
//  - gk_sesion      (8 h)      JWT de acceso. Es la que se usa en cada petición.
//  - gk_dispositivo (7 días)   token opaco de "este dispositivo" (ver utils/refresco.js). Si falta gk_sesion pero
//                              esta es válida, el servidor emite una gk_sesion nueva sin pedir login otra vez.
// Si se borran LAS DOS, la sesión se cierra: es lo correcto, porque ya no queda nada que identifique al usuario.
const COOKIE = 'gk_sesion';
const COOKIE_REFRESCO = 'gk_dispositivo';
const DURACION_MS = 8 * 60 * 60 * 1000;
const DIAS_REFRESCO = Number(process.env.SESION_DIAS) > 0 ? Number(process.env.SESION_DIAS) : 7;

const opciones = () => ({
  httpOnly: true,
  secure: process.env.COOKIE_SECURE ? process.env.COOKIE_SECURE === 'true' : process.env.NODE_ENV === 'production',
  sameSite: 'lax',
  path: '/',
});

// La cookie de dispositivo solo viaja a /api (no a las páginas): menos exposición.
const opcionesRefresco = () => ({ ...opciones(), path: '/api' });

exports.COOKIE = COOKIE;
exports.COOKIE_REFRESCO = COOKIE_REFRESCO;
exports.DIAS_REFRESCO = DIAS_REFRESCO;

exports.fijarCookie = (res, token) => res.cookie(COOKIE, token, { ...opciones(), maxAge: DURACION_MS });

exports.fijarCookieRefresco = (res, token) =>
  res.cookie(COOKIE_REFRESCO, token, { ...opcionesRefresco(), maxAge: DIAS_REFRESCO * 24 * 60 * 60 * 1000 });

exports.borrarCookieRefresco = (res) => res.clearCookie(COOKIE_REFRESCO, opcionesRefresco());

// Cierra la sesión del lado del navegador: borra las dos cookies.
exports.borrarCookie = (res) => {
  res.clearCookie(COOKIE, opciones());
  res.clearCookie(COOKIE_REFRESCO, opcionesRefresco());
};

// Lee una cookie a mano para no sumar una dependencia solo por esto.
function leerCookie(req, nombre) {
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
}

exports.leerToken = (req) => leerCookie(req, COOKIE);
exports.leerTokenRefresco = (req) => leerCookie(req, COOKIE_REFRESCO);
