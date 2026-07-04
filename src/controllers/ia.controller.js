const { PrismaClient } = require('@prisma/client');
const { Pool } = require('pg');
const { PrismaPg } = require('@prisma/adapter-pg');
const Groq = require('groq-sdk'); // Solo importamos la clase

// Configuración de Prisma
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

exports.recomendarRuta = async (req, res) => {
  const { consulta } = req.body;
  
  // Instanciamos Groq AQUÍ, dentro de la función, asegurando que .env ya cargó
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

    const prompt = `
      Eres el asistente de GeoKaia... (tu prompt original)
    `;

    const completion = await groq.chat.completions.create({
      model: 'llama3-8b-8192',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.3,
    });

    const respuestaTexto = completion.choices[0].message.content.trim();
    const jsonLimpio = respuestaTexto.replace(/```json|```/g, '').trim();
    const respuestaJSON = JSON.parse(jsonLimpio);

    res.json(respuestaJSON);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};