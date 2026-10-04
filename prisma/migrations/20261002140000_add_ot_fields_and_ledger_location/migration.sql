-- CreateEnum
CREATE TYPE "IssueKind" AS ENUM ('OBRA', 'EMERGENCIAL');

-- AlterTable
ALTER TABLE "Issue" ADD COLUMN     "cancelReason" TEXT,
ADD COLUMN     "cancelledAt" TIMESTAMP(3),
ADD COLUMN     "kind" "IssueKind" NOT NULL DEFAULT 'OBRA',
ADD COLUMN     "nfNumber" TEXT,
ADD COLUMN     "vehiclePlate" TEXT;

-- AlterTable
ALTER TABLE "IssueItem" ADD COLUMN     "isExtra" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Movement" ADD COLUMN     "locationId" TEXT;

-- CreateIndex
CREATE INDEX "Movement_locationId_idx" ON "Movement"("locationId");
