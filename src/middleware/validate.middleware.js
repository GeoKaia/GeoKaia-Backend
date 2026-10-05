const { ZodError } = require('zod');

const validate = (schema) => (req, res, next) => {
  try {
    schema.parse(req.body); // Compara el body con tus reglas
    next(); // Si todo está bien, pasa al siguiente paso
  } catch (err) {
    // Un error que no sea de validación es un bug nuestro: que lo maneje Express, no se disfraza de 400.
    if (!(err instanceof ZodError)) return next(err);

    // Si hay error, envía un mensaje claro con los campos que fallaron.
    // Zod 4 expone los problemas en `issues` (`errors` ya no existe: con él esto devolvía un 500 en HTML).
    return res.status(400).json({
      error: 'Error de validación',
      detalles: err.issues.map((e) => ({ campo: e.path[0], mensaje: e.message })),
    });
  }
};

module.exports = validate;
