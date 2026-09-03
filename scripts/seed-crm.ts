import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

const TAGS = [["flower"], ["concentrates"], ["edibles"], ["flower", "vip"], []];

async function main() {
  const brand = await prisma.brand.findFirstOrThrow({ where: { slug: "high-state" } });

  await prisma.alert.deleteMany({ where: { brandId: brand.id } });
  await prisma.alertSegment.deleteMany({ where: { brandId: brand.id } });
  await prisma.customer.deleteMany({ where: { brandId: brand.id } });
  await prisma.special.deleteMany({ where: { brandId: brand.id } });

  // Customers with varied consent — the point is that channels are separate.
  for (let i = 1; i <= 24; i++) {
    const emailOptIn = i % 5 !== 0;
    const smsOptIn = i % 3 === 0;
    const pushOptIn = i % 4 === 0;
    const revoked = i % 11 === 0;
    await prisma.customer.create({
      data: {
        brandId: brand.id,
        email: `customer${i}@example.com`,
        phone: smsOptIn ? `+1585555${String(1000 + i)}` : null,
        emailOptIn, smsOptIn, pushOptIn,
        consentAt: new Date(Date.now() - i * 86_400_000),
        consentSource: i % 2 === 0 ? "menu_footer" : "qr_landing",
        consentIp: `198.51.100.${i}`,
        revokedAt: revoked ? new Date(Date.now() - 86_400_000) : null,
        tags: TAGS[i % TAGS.length],
      },
    });
  }

  const segs = await Promise.all([
    prisma.alertSegment.create({ data: { brandId: brand.id, name: "All email subscribers", channel: "EMAIL", filter: { emailOptIn: true } } }),
    prisma.alertSegment.create({ data: { brandId: brand.id, name: "SMS — drop alerts", channel: "SMS", filter: { smsOptIn: true } } }),
    prisma.alertSegment.create({ data: { brandId: brand.id, name: "Push — concentrate fans", channel: "PUSH", filter: { pushOptIn: true, tags: ["concentrates"] } } }),
  ]);

  await prisma.alert.createMany({
    data: [
      { brandId: brand.id, segmentId: segs[1].id, title: "Moon Rosin is back", body: "Cold-cure live rosin, back on shelves at three stores. Limited run.", channel: "SMS", status: "SENT", sentAt: new Date(Date.now() - 3 * 86_400_000), recipientCount: 8 },
      { brandId: brand.id, segmentId: segs[0].id, title: "This week at High State", body: "Two new cultivars and a restock on Orbit Runtz.", channel: "EMAIL", status: "PENDING_APPROVAL" },
      { brandId: brand.id, segmentId: segs[2].id, title: "Concentrate drop Friday", body: "First press of the season lands Friday morning.", channel: "PUSH", status: "DRAFT" },
    ],
  });

  await prisma.special.createMany({
    data: [
      { brandId: brand.id, name: "First-time customer", code: "WELCOME10", description: "10% off a first purchase at any carrying retailer.", discountType: "PERCENT", discountValue: "10.00", active: true, stateCodes: ["NY"], startsAt: new Date(Date.now() - 7 * 86_400_000) },
      { brandId: brand.id, name: "Concentrate Friday", code: "PRESSDAY", description: "$5 off any live rosin.", discountType: "FIXED", discountValue: "5.00", active: false, stateCodes: ["NY"] },
    ],
  });

  console.log({
    customers: await prisma.customer.count({ where: { brandId: brand.id } }),
    segments: await prisma.alertSegment.count({ where: { brandId: brand.id } }),
    alerts: await prisma.alert.count({ where: { brandId: brand.id } }),
    specials: await prisma.special.count({ where: { brandId: brand.id } }),
  });
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
