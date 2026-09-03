import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

/**
 * Demo seed. Fictional brand and retailers — nothing here is a real
 * licensee. Used for local dev and for the public demo instance.
 */
async function main() {
  console.log("Seeding…");

  // Clean slate, child-first so FKs don't complain.
  await prisma.retailerListing.deleteMany();
  await prisma.brandRetailer.deleteMany();
  await prisma.labResult.deleteMany();
  await prisma.batch.deleteMany();
  await prisma.productVariant.deleteMany();
  await prisma.product.deleteMany();
  await prisma.complianceRule.deleteMany();
  await prisma.retailer.deleteMany();
  await prisma.brand.deleteMany();

  const brand = await prisma.brand.create({
    data: {
      slug: "north-shore",
      name: "North Shore Cultivars",
      tagline: "Small-batch flower, grown in the Finger Lakes.",
      about:
        "A family-run cultivator working out of the Finger Lakes. Every lot " +
        "is hand-trimmed, slow-cured, and tested by an independent lab before " +
        "it leaves the building.",
      brandColor: "#2F5D50",
      vertical: "CANNABIS",
      minimumAge: 21,
      websiteUrl: "https://example.com",
      contactEmail: "hello@example.com",
      published: true,
    },
  });

  // Compliance rules — the NY warning text is illustrative, not legal advice.
  await prisma.complianceRule.createMany({
    data: [
      {
        vertical: "CANNABIS",
        stateCode: "NY",
        ruleType: "AGE_GATE",
        requirement:
          "Websites marketing adult-use cannabis must verify the visitor is 21 " +
          "or older before displaying product information.",
        effectiveFrom: new Date("2023-01-01"),
      },
      {
        vertical: "CANNABIS",
        stateCode: "NY",
        ruleType: "COA_DISPLAY",
        requirement:
          "Certificate of analysis for the specific batch must be accessible " +
          "to the consumer.",
        effectiveFrom: new Date("2023-01-01"),
      },
    ],
  });

  const products = [
    {
      slug: "harbor-fog",
      name: "Harbor Fog",
      category: "Flower",
      strainType: "HYBRID" as const,
      description:
        "A balanced hybrid with citrus and pine on the nose. Slow-cured for " +
        "fourteen days.",
      sortOrder: 1,
      variants: [
        { size: "3.5g", sku: "NS-HF-35", thc: "24.100", cbd: "0.200" },
        { size: "7g", sku: "NS-HF-70", thc: "24.100", cbd: "0.200" },
      ],
    },
    {
      slug: "lakeshore-kush",
      name: "Lakeshore Kush",
      category: "Flower",
      strainType: "INDICA" as const,
      description: "Heavy indica, earthy and sweet. An evening cultivar.",
      sortOrder: 2,
      variants: [{ size: "3.5g", sku: "NS-LK-35", thc: "26.800", cbd: "0.100" }],
    },
    {
      slug: "sunbreak-gummies",
      name: "Sunbreak Gummies",
      category: "Edibles",
      strainType: "NOT_APPLICABLE" as const,
      description: "Blood orange. Ten pieces, ten milligrams each.",
      sortOrder: 3,
      variants: [
        {
          size: "10mg x 10",
          sku: "NS-SG-100",
          thc: "10.000",
          cbd: "0.000",
          potencyUnit: "MG_PER_SERVING" as const,
        },
      ],
    },
  ];

  for (const p of products) {
    const { variants, ...productData } = p;
    const product = await prisma.product.create({
      data: { ...productData, brandId: brand.id, published: true },
    });

    for (const v of variants) {
      const variant = await prisma.productVariant.create({
        data: { ...v, productId: product.id },
      });

      // One batch per variant, with a current COA.
      const batch = await prisma.batch.create({
        data: {
          variantId: variant.id,
          batchCode: `${v.sku}-B2609`,
          packagedOn: new Date("2026-08-10"),
          stateCodes: ["NY"],
        },
      });

      await prisma.labResult.create({
        data: {
          batchId: batch.id,
          labName: "Finger Lakes Analytical",
          testedOn: new Date("2026-08-04"),
          fileUrl: `https://example.com/coa/${batch.batchCode}.pdf`,
          isCurrent: true,
          thc: v.thc,
          cbd: v.cbd,
          passedScreening: true,
        },
      });
    }
  }

  // Retailers carrying the brand.
  const retailers = [
    {
      name: "Genesee Provisions",
      city: "Rochester",
      stateCode: "NY",
      address1: "1200 Monroe Ave",
      latitude: 43.1394,
      longitude: -77.5872,
    },
    {
      name: "Lakeside Dispensary",
      city: "Canandaigua",
      stateCode: "NY",
      address1: "88 Lakeshore Dr",
      latitude: 42.8873,
      longitude: -77.2819,
    },
    {
      name: "Keuka Green",
      city: "Penn Yan",
      stateCode: "NY",
      address1: "14 Main St",
      latitude: 42.6606,
      longitude: -77.0539,
    },
  ];

  const allProducts = await prisma.product.findMany({
    where: { brandId: brand.id },
  });

  for (const [i, r] of retailers.entries()) {
    const retailer = await prisma.retailer.create({ data: r });
    await prisma.brandRetailer.create({
      data: {
        brandId: brand.id,
        retailerId: retailer.id,
        verifiedOn: new Date(),
        active: true,
      },
    });

    // Stagger observedAt so the staleness flag has something to show:
    // the third store's listing is deliberately old.
    const daysAgo = i === 2 ? 45 : 2;
    const observedAt = new Date(Date.now() - daysAgo * 86_400_000);

    for (const product of allProducts) {
      await prisma.retailerListing.create({
        data: {
          retailerId: retailer.id,
          productId: product.id,
          listedPrice: product.category === "Edibles" ? "25.00" : "45.00",
          inStock: true,
          source: "manual",
          observedAt,
        },
      });
    }
  }

  const counts = {
    brands: await prisma.brand.count(),
    products: await prisma.product.count(),
    variants: await prisma.productVariant.count(),
    batches: await prisma.batch.count(),
    coas: await prisma.labResult.count(),
    retailers: await prisma.retailer.count(),
    listings: await prisma.retailerListing.count(),
  };
  console.log("Seeded:", counts);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
