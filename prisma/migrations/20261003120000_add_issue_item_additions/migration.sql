-- CreateTable
CREATE TABLE "IssueItemAddition" (
    "id" TEXT NOT NULL,
    "issueItemId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "userId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IssueItemAddition_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "IssueItemAddition_issueItemId_idx" ON "IssueItemAddition"("issueItemId");

-- AddForeignKey
ALTER TABLE "IssueItemAddition" ADD CONSTRAINT "IssueItemAddition_issueItemId_fkey" FOREIGN KEY ("issueItemId") REFERENCES "IssueItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IssueItemAddition" ADD CONSTRAINT "IssueItemAddition_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
