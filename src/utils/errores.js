// Respuesta de error 500 sin filtrar detalles internos. Los mensajes de Prisma/pg incluyen nombres de
// tablas, columnas y fragmentos de consulta: sirven para depurar, pero no deben llegar al cliente.
// El detalle completo queda en el log del servidor (Render lo conserva).
exports.responderError = (res, err, mensaje = 'Error interno del servidor') => {
  console.error(`[error] ${mensaje}:`, err);
  if (res.headersSent) return;
  res.status(500).json({ error: mensaje });
};
