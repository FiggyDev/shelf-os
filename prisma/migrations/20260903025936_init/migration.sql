-- CreateEnum
CREATE TYPE "Vertical" AS ENUM ('CANNABIS', 'HEMP', 'NICOTINE', 'OTHER');

-- CreateEnum
CREATE TYPE "StrainType" AS ENUM ('INDICA', 'SATIVA', 'HYBRID', 'NOT_APPLICABLE');

-- CreateEnum
CREATE TYPE "PotencyUnit" AS ENUM ('PERCENT', 'MG', 'MG_PER_SERVING');

-- CreateEnum
CREATE TYPE "RuleType" AS ENUM ('LABEL_WARNING', 'POTENCY_LIMIT', 'AGE_GATE', 'ADVERTISING', 'COA_DISPLAY', 'PACKAGING', 'REPORTING');

-- CreateTable
CREATE TABLE "Brand" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "tagline" TEXT,
    "about" TEXT,
    "logoUrl" TEXT,
    "heroUrl" TEXT,
    "brandColor" TEXT DEFAULT '#111111',
    "websiteUrl" TEXT,
    "contactEmail" TEXT,
    "vertical" "Vertical" NOT NULL DEFAULT 'CANNABIS',
    "minimumAge" INTEGER NOT NULL DEFAULT 21,
    "published" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Brand_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Product" (
    "id" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT,
    "strainType" "StrainType",
    "imageUrl" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "published" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductVariant" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "size" TEXT NOT NULL,
    "sku" TEXT,
    "thc" DECIMAL(7,3),
    "cbd" DECIMAL(7,3),
    "potencyUnit" "PotencyUnit" NOT NULL DEFAULT 'PERCENT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductVariant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Batch" (
    "id" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "batchCode" TEXT NOT NULL,
    "packagedOn" TIMESTAMP(3),
    "expiresOn" TIMESTAMP(3),
    "stateCodes" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Batch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LabResult" (
    "id" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "labName" TEXT,
    "testedOn" TIMESTAMP(3),
    "fileUrl" TEXT NOT NULL,
    "isCurrent" BOOLEAN NOT NULL DEFAULT true,
    "thc" DECIMAL(7,3),
    "cbd" DECIMAL(7,3),
    "passedScreening" BOOLEAN,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LabResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ComplianceRule" (
    "id" TEXT NOT NULL,
    "brandId" TEXT,
    "vertical" "Vertical" NOT NULL,
    "stateCode" TEXT NOT NULL,
    "ruleType" "RuleType" NOT NULL,
    "requirement" TEXT NOT NULL,
    "parameters" JSONB,
    "citationUrl" TEXT,
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "effectiveTo" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ComplianceRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Retailer" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address1" TEXT,
    "city" TEXT,
    "stateCode" TEXT,
    "postalCode" TEXT,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "phone" TEXT,
    "websiteUrl" TEXT,
    "menuUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Retailer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BrandRetailer" (
    "id" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "retailerId" TEXT NOT NULL,
    "verifiedOn" TIMESTAMP(3),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BrandRetailer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RetailerListing" (
    "id" TEXT NOT NULL,
    "retailerId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "listedPrice" DECIMAL(10,2),
    "inStock" BOOLEAN,
    "source" TEXT,
    "sourceUrl" TEXT,
    "observedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RetailerListing_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Brand_slug_key" ON "Brand"("slug");

-- CreateIndex
CREATE INDEX "Brand_published_idx" ON "Brand"("published");

-- CreateIndex
CREATE INDEX "Product_brandId_published_idx" ON "Product"("brandId", "published");

-- CreateIndex
CREATE UNIQUE INDEX "Product_brandId_slug_key" ON "Product"("brandId", "slug");

-- CreateIndex
CREATE INDEX "ProductVariant_productId_idx" ON "ProductVariant"("productId");

-- CreateIndex
CREATE INDEX "Batch_batchCode_idx" ON "Batch"("batchCode");

-- CreateIndex
CREATE UNIQUE INDEX "Batch_variantId_batchCode_key" ON "Batch"("variantId", "batchCode");

-- CreateIndex
CREATE INDEX "LabResult_batchId_isCurrent_idx" ON "LabResult"("batchId", "isCurrent");

-- CreateIndex
CREATE INDEX "ComplianceRule_vertical_stateCode_effectiveFrom_idx" ON "ComplianceRule"("vertical", "stateCode", "effectiveFrom");

-- CreateIndex
CREATE INDEX "Retailer_stateCode_city_idx" ON "Retailer"("stateCode", "city");

-- CreateIndex
CREATE INDEX "BrandRetailer_brandId_active_idx" ON "BrandRetailer"("brandId", "active");

-- CreateIndex
CREATE UNIQUE INDEX "BrandRetailer_brandId_retailerId_key" ON "BrandRetailer"("brandId", "retailerId");

-- CreateIndex
CREATE INDEX "RetailerListing_productId_observedAt_idx" ON "RetailerListing"("productId", "observedAt");

-- CreateIndex
CREATE UNIQUE INDEX "RetailerListing_retailerId_productId_key" ON "RetailerListing"("retailerId", "productId");

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductVariant" ADD CONSTRAINT "ProductVariant_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Batch" ADD CONSTRAINT "Batch_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LabResult" ADD CONSTRAINT "LabResult_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "Batch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComplianceRule" ADD CONSTRAINT "ComplianceRule_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BrandRetailer" ADD CONSTRAINT "BrandRetailer_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BrandRetailer" ADD CONSTRAINT "BrandRetailer_retailerId_fkey" FOREIGN KEY ("retailerId") REFERENCES "Retailer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RetailerListing" ADD CONSTRAINT "RetailerListing_retailerId_fkey" FOREIGN KEY ("retailerId") REFERENCES "Retailer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RetailerListing" ADD CONSTRAINT "RetailerListing_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
