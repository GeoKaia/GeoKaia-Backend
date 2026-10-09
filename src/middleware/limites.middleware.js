const rateLimit = require('express-rate-limit');
const jwt = require('jsonwebtoken');

// Límites de peticiones por IP (y, en el 2FA, por cuenta). Frenan la fuerza bruta contra el login y el
// código 2FA, el abuso del chat de Kaia (cada consulta cuesta una llamada a Groq) y la inundación de
// peticiones (DoS a nivel de aplicación). Son en memoria: bastan para una sola instancia de Render; con
// varias instancias habría que moverlos a un almacén compartido (por ejemplo Redis).
//
// Los topes son holgados a propósito: en un evento muchas personas comparten la misma IP pública.
const crear = (ventanaMin, limite, mensaje, extra = {}) =>
  rateLimit({
    windowMs: ventanaMin * 60 * 1000,
    limit: limite,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { error: mensaje },
    ...extra,
  });

// Tope general para toda la API.
exports.limiteGeneral = crear(15, 600, 'Demasiadas peticiones. Esperá unos minutos e intentá de nuevo.');

// Login: solo cuentan los intentos fallidos, así que un uso normal nunca se topa con el límite.
exports.limiteLogin = crear(15, 20, 'Demasiados intentos de inicio de sesión. Esperá 15 minutos e intentá de nuevo.', {
  skipSuccessfulRequests: true,
});

// Código 2FA: son solo 1.000.000 de combinaciones, así que además del tope por IP hay uno por cuenta
// para que no se pueda adivinar repartiendo los intentos entre muchas IP.
exports.limite2FAPorIp = crear(15, 30, 'Demasiados intentos de verificación. Esperá 15 minutos e intentá de nuevo.', {
  skipSuccessfulRequests: true,
});
exports.limite2FAPorCuenta = crear(15, 8, 'Demasiados intentos con este código. Esperá 15 minutos e intentá de nuevo.', {
  skipSuccessfulRequests: true,
  // La cuenta se saca del pasoToken (sin verificarlo: solo para contar; la verificación real la hace el controlador).
  keyGenerator: (req) => `cuenta:${jwt.decode(req.body?.pasoToken)?.sub ?? 'sin-paso'}`,
  validate: { keyGeneratorIpFallback: false },
});

// Crear cuentas y mandar el formulario de contacto: poco frecuentes en uso real.
exports.limiteRegistro = crear(60, 15, 'Demasiados registros desde esta conexión. Probá de nuevo en una hora.');
exports.limiteLeads = crear(60, 15, 'Ya recibimos varios mensajes desde esta conexión. Probá de nuevo en una hora.');

// Chat de Kaia: cada consulta llama al modelo de IA.
exports.limiteIA = crear(1, 20, 'Kaia está atendiendo muchas consultas. Esperá un momento e intentá de nuevo.');

// Recuperación de contraseña: pocas solicitudes por IP (además del tope por cuenta que aplica el controlador).
exports.limiteRecuperacion = crear(60, 10, 'Demasiadas solicitudes de recuperación desde esta conexión. Probá de nuevo en una hora.');
