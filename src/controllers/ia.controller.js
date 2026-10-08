const { PrismaClient } = require('@prisma/client');
const { responderError } = require('../utils/errores');
const { Pool } = require('pg');
const { PrismaPg } = require('@prisma/adapter-pg');
const Groq = require('groq-sdk');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

exports.recomendarRuta = async (req, res) => {
  const { consulta } = req.body;
  const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

  if (!consulta) {
    return res.status(400).json({ error: 'El campo consulta es requerido' });
  }

  try {
    const rutas = await prisma.ruta.findMany({
      include: {
        paradas: {
          include: { lugar: true },
          orderBy: { orden: 'asc' },
        },
      },
    });

    if (rutas.length === 0) {
      return res.status(404).json({ error: 'No hay rutas disponibles aún' });
    }

    const contextRutas = rutas.map(r => ({
      id: r.id,
      nombre: r.nombre,
      categoria: r.categoria,
      descripcion: r.descripcion,
      descripcionParaIA: r.descripcionParaIA,
      paradas: r.paradas.map(p => p.lugar.nombre),
    }));

    const prompt = `Eres el asistente de GeoKaia, una plataforma de turismo en Nicaragua.
Tu única tarea es recomendar rutas turísticas del catálogo disponible según lo que pide el turista.
NUNCA inventes rutas nuevas. SOLO elige entre las rutas del catálogo.

CATÁLOGO DE RUTAS DISPONIBLES:
${JSON.stringify(contextRutas, null, 2)}

PETICIÓN DEL TURISTA:
"${consulta}"

Respondé ÚNICAMENTE con un JSON válido con este formato exacto, sin texto adicional:
{
  "recomendaciones": [
    {
      "rutaId": 1,
      "nombre": "Nombre de la ruta",
      "razon": "Por qué esta ruta encaja con lo que pidió el turista"
    }
  ],
  "mensaje": "Un mensaje amigable de 1-2 oraciones para el turista"
}`;

    // llama-3.3-70b-versatile fue retirado del catálogo de Groq. openai/gpt-oss-20b
    // devuelve el mismo JSON limpio y es un modelo chico -> menos cómputo, en línea
    // con el argumento de sostenibilidad del pitch (LPUs de Groq + modelo liviano).
    const completion = await groq.chat.completions.create({
      model: 'openai/gpt-oss-20b',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.3,
    });

    const respuestaTexto = completion.choices[0].message.content.trim();
    const jsonLimpio = respuestaTexto.replace(/```json|```/g, '').trim();
    const respuestaJSON = JSON.parse(jsonLimpio);

    // La salida del modelo no es de confianza: se conservan solo las recomendaciones de rutas que existen
    // y textos de largo razonable, sin importar lo que el modelo (o un prompt malicioso) haya devuelto.
    const idsValidos = new Set(rutas.map((r) => r.id));
    const recomendaciones = (Array.isArray(respuestaJSON.recomendaciones) ? respuestaJSON.recomendaciones : [])
      .filter((r) => idsValidos.has(r?.rutaId))
      .slice(0, 5)
      .map((r) => ({
        rutaId: r.rutaId,
        nombre: String(r.nombre ?? '').slice(0, 120),
        razon: String(r.razon ?? '').slice(0, 400),
      }));
    const mensaje = String(respuestaJSON.mensaje ?? '').slice(0, 400);

    res.json({ recomendaciones, mensaje });
  } catch (err) {
    responderError(res, err);
  }
};