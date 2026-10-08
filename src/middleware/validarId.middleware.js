// Se usa con router.param('id', validarId): corta con 400 cualquier :id que no sea un entero positivo
// ("abc", "1; DROP TABLE...", "-5", "1e9999"). Sin esto, parseInt devolvía NaN y Prisma lanzaba un error
// que terminaba en un 500.
module.exports = (req, res, next, valor) => {
  if (!/^\d{1,9}$/.test(valor) || Number(valor) < 1) {
    return res.status(400).json({ error: 'El identificador no es válido' });
  }
  next();
};
