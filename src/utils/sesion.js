// Sesión por cookie httpOnly: el JWT ya no viaja por JavaScript (ni localStorage ni sessionStorage), así que un
// script inyectado (XSS) o alguien mirando F12 > Application no puede leerlo ni copiarlo.
//  - httpOnly: JavaScript no la ve.
//  - secure: solo por HTTPS (en producción).
//  - sameSite 'lax': el navegador no la manda en peticiones POST/PATCH/DELETE iniciadas desde otro sitio (CSRF).
//  - maxAge de 8 h, igual que la vigencia del JWT.
const COOKIE = 'gk_sesion';
const DURACION_MS = 8 * 60 * 60 * 1000;

const opciones = () => ({
  httpOnly: true,
  secure: process.env.COOKIE_SECURE ? process.env.COOKIE_SECURE === 'true' : process.env.NODE_ENV === 'production',
  sameSite: 'lax',
  path: '/',
});

exports.COOKIE = COOKIE;

exports.fijarCookie = (res, token) => res.cookie(COOKIE, token, { ...opciones(), maxAge: DURACION_MS });

exports.borrarCookie = (res) => res.clearCookie(COOKIE, opciones());

// Lee la cookie a mano para no sumar una dependencia solo por esto.
exports.leerToken = (req) => {
  const crudo = req.headers.cookie;
  if (!crudo) return null;
  for (const par of crudo.split(';')) {
    const i = par.indexOf('=');
    if (i === -1) continue;
    if (par.slice(0, i).trim() === COOKIE) {
      try {
        return decodeURIComponent(par.slice(i + 1).trim());
      } catch {
        return null;
      }
    }
  }
  return null;
};
