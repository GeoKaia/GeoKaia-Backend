require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');

// 1. Importaciones de rutas
const iaRoutes = require('./routes/ia.routes');
const lugaresRoutes = require('./routes/lugares.routes');
const authRoutes = require('./routes/auth.routes');
const rutasRoutes = require('./routes/rutas.routes');
const leadsRoutes = require('./routes/leads.routes');
const adminRoutes = require('./routes/admin.routes');
const mensajesRoutes = require('./routes/mensajes.routes');
const { limiteGeneral } = require('./middleware/limites.middleware');

const app = express();
const PORT = process.env.PORT || 4000;

// 2. Middlewares Globales
// Render pone un proxy delante del servidor: sin esto req.ip sería siempre la IP del proxy y el límite de
// peticiones contaría a todos los visitantes como una sola persona.
// TRUST_PROXY_HOPS: cuántos proxies hay delante (1 = solo Render). Si el frontend reenvía /api con rewrites (Vercel)
// o hay Nginx delante, la IP real del visitante queda un salto más atrás: poné 2. Con un número de más, quien
// llame directo podría falsear su IP en X-Forwarded-For: no lo subas si no hay tantos proxies reales.
app.set('trust proxy', Number(process.env.TRUST_PROXY_HOPS) || 1);

// Cabeceras de seguridad estándar (HSTS, nosniff, sin X-Powered-By, etc.).
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));

// CORS: solo los dominios del frontend (y localhost para desarrollo) pueden llamar a la API desde un
// navegador. CORS_ORIGINS (separados por coma) SUMA dominios a esta lista, nunca la reemplaza: así
// definirla por error no puede dejar afuera al frontend de producción.
const ORIGENES_BASE = ['https://geokaia.vercel.app', 'https://geo-kaia-frontend.vercel.app'];
const ORIGENES_PERMITIDOS = [
  ...ORIGENES_BASE,
  ...(process.env.CORS_ORIGINS || '')
    .split(',')
    .map((o) => o.trim().replace(/\/$/, ''))
    .filter(Boolean),
];
const esOrigenLocal = (origen) => /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origen);
app.use(
  cors({
    origin: (origen, cb) => cb(null, !origen || ORIGENES_PERMITIDOS.includes(origen) || esOrigenLocal(origen)),
    // La sesión viaja en una cookie: sin credentials el navegador no la manda ni la guarda en peticiones cross-origin.
    credentials: true,
    maxAge: 600,
  })
);

// CSRF: como la sesión es una cookie, una página ajena podría intentar mandar un POST/PATCH/DELETE en nombre
// de quien tiene la sesión abierta. Defensas: (1) SameSite=Lax en la cookie; (2) esta verificación de Origin en toda
// petición que escribe datos: si trae un Origin tiene que ser uno permitido, y si la petición lleva la cookie de
// sesión el Origin es OBLIGATORIO (los navegadores lo mandan siempre en POST/PATCH/DELETE; quien no lo manda no es
// un navegador de esta aplicación); (3) la API solo acepta JSON, que un formulario de otro sitio no puede enviar
// sin pasar por CORS.
const { nombreCookie } = require('./utils/sesion');
app.use((req, res, next) => {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  const origen = req.headers.origin;
  const permitido = origen && (ORIGENES_PERMITIDOS.includes(origen) || esOrigenLocal(origen));
  if (origen && !permitido) return res.status(403).json({ error: 'Origen no permitido' });
  const llevaSesion = (req.headers.cookie || '').split(';').some((c) => c.trim().startsWith(nombreCookie() + '='));
  if (llevaSesion && !permitido) return res.status(403).json({ error: 'Origen no permitido' });
  next();
});

// Tope de peticiones por IP (DoS a nivel de aplicación) y de tamaño del cuerpo.
app.use(limiteGeneral);
app.use(express.json({ limit: '50kb' }));

// 3. Registro de Rutas
app.get('/', (req, res) => {
  res.json({ mensaje: 'GeoKaia backend funcionando' });
});

app.use('/api/ia', iaRoutes);
app.use('/api/lugares', lugaresRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/rutas', rutasRoutes);
app.use('/api/leads', leadsRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/mensajes', mensajesRoutes);

// 4. Errores. Sin esto, una ruta inexistente o un JSON mal formado devolvían la página de error por
// defecto de Express, que en desarrollo incluye la traza (rutas de archivos y versiones).
app.use((req, res) => {
  res.status(404).json({ error: 'Ruta no encontrada' });
});

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (err.type === 'entity.too.large') {
    return res.status(413).json({ error: 'La petición es demasiado grande' });
  }
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'El cuerpo de la petición no es un JSON válido' });
  }
  console.error('[error no controlado]', err);
  res.status(500).json({ error: 'Error interno del servidor' });
});

// 5. Arranque del servidor
const server = app.listen(PORT, () => {
  console.log(`Servidor corriendo en http://localhost:${PORT}`);
});

// Una petición tiene como máximo 30 s para completarse (la llamada a la IA es la más lenta): evita que
// conexiones lentas (slowloris) queden abiertas indefinidamente ocupando el servidor.
server.requestTimeout = 30000;
