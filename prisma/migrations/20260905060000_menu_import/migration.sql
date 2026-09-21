ALTER TABLE "Product" ADD COLUMN "importNotes" TEXT;
CREATE TABLE "MenuImport" (
  "id" TEXT NOT NULL,
  "brandId" TEXT NOT NULL,
  "requestId" TEXT NOT NULL,
  "requestHash" TEXT NOT NULL,
  "productIds" TEXT[] NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MenuImport_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "MenuImport_brandId_requestId_key" ON "MenuImport"("brandId", "requestId");
ALTER TABLE "MenuImport" ADD CONSTRAINT "MenuImport_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE CASCADE ON UPDATE CASCADE;
