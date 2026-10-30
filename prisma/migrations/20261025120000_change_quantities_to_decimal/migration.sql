-- Change quantity fields from Int to Decimal to support fractional measures
-- (e.g. kg, m, mm) instead of truncating to whole numbers.

ALTER TABLE "Stock" ALTER COLUMN "quantity" TYPE DECIMAL USING "quantity"::DECIMAL;

ALTER TABLE "Movement" ALTER COLUMN "quantity" TYPE DECIMAL USING "quantity"::DECIMAL;

ALTER TABLE "IssueItem" ALTER COLUMN "quantity" TYPE DECIMAL USING "quantity"::DECIMAL;

ALTER TABLE "IssueItem" ALTER COLUMN "fulfilledQuantity" TYPE DECIMAL USING "fulfilledQuantity"::DECIMAL;

ALTER TABLE "IssueItemAddition" ALTER COLUMN "quantity" TYPE DECIMAL USING "quantity"::DECIMAL;

ALTER TABLE "StockCountItem" ALTER COLUMN "systemQuantity" TYPE DECIMAL USING "systemQuantity"::DECIMAL;

ALTER TABLE "StockCountItem" ALTER COLUMN "countedQuantity" TYPE DECIMAL USING "countedQuantity"::DECIMAL;

ALTER TABLE "StockCountItem" ALTER COLUMN "difference" TYPE DECIMAL USING "difference"::DECIMAL;

ALTER TABLE "PurchaseInvoiceLine" ALTER COLUMN "quantity" TYPE DECIMAL USING "quantity"::DECIMAL;

ALTER TABLE "ReturnItem" ALTER COLUMN "quantity" TYPE DECIMAL USING "quantity"::DECIMAL;
