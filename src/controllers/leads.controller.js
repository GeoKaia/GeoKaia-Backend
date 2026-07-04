const { PrismaClient } = require('@prisma/client');
const { Pool } = require('pg');
const { PrismaPg } = require('@prisma/adapter-pg');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

exports.crearLead = async (req, res) => {
  try {
    const { nombre, email, negocio } = req.body;
    
    const nuevoLead = await prisma.lead.create({
      data: { nombre, email, negocio }
    });

    res.status(201).json({ mensaje: '¡Gracias! Nos pondremos en contacto pronto.', lead: nuevoLead });
  } catch (error) {
    res.status(500).json({ error: 'Error al enviar el formulario: ' + error.message });
  }
};