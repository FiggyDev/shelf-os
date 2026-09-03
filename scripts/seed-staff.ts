import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

async function main() {
  const brand = await prisma.brand.findFirst({ where: { slug: "north-shore" } });
  if (!brand) throw new Error("seed the brand first");

  await prisma.staffUser.upsert({
    where: { brandId_email: { brandId: brand.id, email: "owner@example.com" } },
    update: {},
    create: {
      brandId: brand.id,
      email: "owner@example.com",
      name: "Demo Owner",
      role: "OWNER",
    },
  });

  await prisma.staffUser.upsert({
    where: { brandId_email: { brandId: brand.id, email: "manager@example.com" } },
    update: {},
    create: {
      brandId: brand.id,
      email: "manager@example.com",
      name: "Demo Manager",
      role: "MANAGER",
    },
  });

  console.log("staff:", await prisma.staffUser.count({ where: { brandId: brand.id } }));
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
