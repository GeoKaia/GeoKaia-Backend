// Cliente de Prisma compartido por el código nuevo (servicios y middlewares). Los controladores anteriores crean el
// suyo propio; se van migrando a este a medida que se tocan.
const { PrismaClient } = require('@prisma/client');
const { Pool } = require('pg');
const { PrismaPg } = require('@prisma/adapter-pg');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

module.exports = { prisma, pool };
