import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

/**
 * Demo tenant: High State of Mind.
 * Placeholder licence number — real tenants supply their own.
 */
async function main() {
  const brand = await prisma.brand.upsert({
    where: { slug: "high-state" },
    update: {
      logoUrl: "/brand/high-state/high-state-circle-base.png",
      overlayUrl: "/brand/high-state/high-state-astronaut.png",
      shareImageUrl: "/brand/high-state/high-state-circle-share.png",
    },
    create: {
      slug: "high-state",
      name: "High State of Mind",
      tagline: "Rochester grown. Cosmically inclined.",
      about:
        "A Rochester brand built on the corner of the Genesee and the far " +
        "side of the atmosphere. Small batches, loud flavours, and a menu " +
        "that actually tells you what's in the jar.",
      brandColor: "#9DFF3C",
      vertical: "CANNABIS",
      minimumAge: 21,
      licenseNumber: "DEMO-TENANT-0000",
      logoUrl: "/brand/high-state/high-state-circle-base.png",
      overlayUrl: "/brand/high-state/high-state-astronaut.png",
      shareImageUrl: "/brand/high-state/high-state-circle-share.png",
      published: true,
    },
  });

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

  const catalog = [
    { slug: "orbit-runtz", name: "Orbit Runtz", category: "Flower", strainType: "HYBRID" as const,
      description: "Loud, sweet, and heavy on the nose. Cured slow.", sortOrder: 1,
      variants: [{ size: "3.5g", thc: "27.400" }, { size: "7g", thc: "27.400" }] },
    { slug: "genesee-kush", name: "Genesee Kush", category: "Flower", strainType: "INDICA" as const,
      description: "Riverbank indica. Built for a night that ends early.", sortOrder: 2,
      variants: [{ size: "3.5g", thc: "29.100" }] },
    { slug: "liftoff-haze", name: "Liftoff Haze", category: "Flower", strainType: "SATIVA" as const,
      description: "Bright citrus sativa. Daytime fuel.", sortOrder: 3,
      variants: [{ size: "3.5g", thc: "25.800" }] },
    { slug: "moon-rosin", name: "Moon Rosin", category: "Concentrates", strainType: "HYBRID" as const,
      description: "Cold-cure live rosin, pressed in-house.", sortOrder: 4,
      variants: [{ size: "1g", thc: "78.200" }] },
    { slug: "gravity-gummies", name: "Gravity Gummies", category: "Edibles", strainType: "NOT_APPLICABLE" as const,
      description: "Blood orange. Ten pieces, ten milligrams each.", sortOrder: 5,
      variants: [{ size: "10mg x 10", thc: "10.000", potencyUnit: "MG_PER_SERVING" as const }] },
  ];

  for (const p of catalog) {
    const { variants, ...data } = p;
    const product = await prisma.product.upsert({
      where: { brandId_slug: { brandId: brand.id, slug: p.slug } },
      update: {},
      create: { ...data, brandId: brand.id, published: true },
    });
    for (const v of variants) {
      const existing = await prisma.productVariant.findFirst({
        where: { productId: product.id, size: v.size },
      });
      if (existing) continue;
      const variant = await prisma.productVariant.create({
        data: { ...v, productId: product.id, sku: `HSM-${p.slug.toUpperCase()}-${v.size}` },
      });
      const batch = await prisma.batch.create({
        data: { variantId: variant.id, batchCode: `HSM-${Date.now().toString().slice(-6)}`,
                packagedOn: new Date("2026-08-20"), stateCodes: ["NY"] },
      });
      await prisma.labResult.create({
        data: { batchId: batch.id, labName: "Empire Analytical", testedOn: new Date("2026-08-15"),
                fileUrl: `https://example.com/coa/${batch.batchCode}.pdf`, isCurrent: true,
                thc: v.thc, passedScreening: true },
      });
    }
  }

  // Retailers and listings.
  //
  // Names are fictional. This is a public repository and naming real
  // dispensaries would imply a stocking relationship that doesn't exist.
  //
  // Ages are chosen to exercise every branch of the shelf-presence
  // logic: fresh (<7d), aging, stale (>21d), and one product a store
  // carries the brand but has never listed, which must surface as
  // "missing" rather than simply being absent from the table.
  const daysAgo = (n: number) =>
    new Date(Date.now() - n * 24 * 60 * 60 * 1000);

  // priceOffset drives the price-mismatch column. Expected price is the
  // median observed price across stores, so a symmetric spread around 0
  // makes the middle store the baseline and flags the other two.
  const STORES = [
    { name: "Genesee Provisions", city: "Rochester", age: 2, priceOffset: 0 },
    { name: "Park Ave Cannabis Co.", city: "Rochester", age: 12, priceOffset: 5 },
    { name: "Lakeside Dispensary", city: "Irondequoit", age: 34, priceOffset: -3 },
    { name: "Highland Green", city: "Rochester", age: null, priceOffset: 0 }, // carries, lists nothing
  ];

  const products = await prisma.product.findMany({
    where: { brandId: brand.id },
    select: { id: true },
    orderBy: { id: "asc" },
  });

  for (const s of STORES) {
    const retailer = await prisma.retailer.upsert({
      where: { id: `hsm-${s.name.toLowerCase().replace(/[^a-z]+/g, "-")}` },
      update: {},
      create: {
        id: `hsm-${s.name.toLowerCase().replace(/[^a-z]+/g, "-")}`,
        name: s.name,
        city: s.city,
        stateCode: "NY",
      },
    });

    await prisma.brandRetailer.upsert({
      where: { brandId_retailerId: { brandId: brand.id, retailerId: retailer.id } },
      update: {},
      create: { brandId: brand.id, retailerId: retailer.id, active: true },
    });

    if (s.age === null) continue; // deliberately unlisted

    for (const [i, product] of products.entries()) {
      const price = 40 + i * 5 + s.priceOffset;
      await prisma.retailerListing.upsert({
        where: { retailerId_productId: { retailerId: retailer.id, productId: product.id } },
        update: { observedAt: daysAgo(s.age), listedPrice: price },
        create: {
          retailerId: retailer.id,
          productId: product.id,
          observedAt: daysAgo(s.age),
          listedPrice: price,
          inStock: true,
          source: "manual",
        },
      });
    }
  }

  console.log("High State of Mind:", {
    products: await prisma.product.count({ where: { brandId: brand.id } }),
    variants: await prisma.productVariant.count({ where: { product: { brandId: brand.id } } }),
    retailers: await prisma.brandRetailer.count({ where: { brandId: brand.id } }),
    listings: await prisma.retailerListing.count({ where: { product: { brandId: brand.id } } }),
  });
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
