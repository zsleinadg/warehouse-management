-- CreateEnum
CREATE TYPE "StockCountStatus" AS ENUM ('PENDING', 'COUNTED', 'APPLIED', 'CANCELLED');

-- DropForeignKey
ALTER TABLE "StockCount" DROP CONSTRAINT "StockCount_locationId_fkey";

-- AlterTable
ALTER TABLE "StockCount" ADD COLUMN     "appliedAt" TIMESTAMP(3),
ADD COLUMN     "appliedBy" TEXT,
ADD COLUMN     "cancelledAt" TIMESTAMP(3),
ADD COLUMN     "cancelledBy" TEXT,
ADD COLUMN     "status" "StockCountStatus" NOT NULL DEFAULT 'PENDING',
ALTER COLUMN "locationId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "StockCountItem" ALTER COLUMN "countedQuantity" DROP NOT NULL,
ALTER COLUMN "difference" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "StockCount_status_idx" ON "StockCount"("status");

-- AddForeignKey
ALTER TABLE "StockCount" ADD CONSTRAINT "StockCount_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;
