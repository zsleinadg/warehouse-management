-- CreateTable
CREATE TABLE "CatalogMaterial" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "plant" TEXT NOT NULL DEFAULT '',
    "name" TEXT NOT NULL,
    "storageLocation" TEXT NOT NULL DEFAULT '',
    "unit" TEXT NOT NULL DEFAULT 'UN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CatalogMaterial_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CatalogMaterial_code_idx" ON "CatalogMaterial"("code");

-- CreateIndex
CREATE INDEX "CatalogMaterial_name_idx" ON "CatalogMaterial"("name");

-- CreateIndex
CREATE UNIQUE INDEX "CatalogMaterial_code_plant_key" ON "CatalogMaterial"("code", "plant");
