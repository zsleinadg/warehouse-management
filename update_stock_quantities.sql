-- Update existing Stock quantities based on Material unit type
-- M, KG = 10000
-- UN, PEÇ, PAR, CJT, CDA, PI, CXT, RLL, KIT, JG, MM, NA = 1000

UPDATE "Stock"
SET "quantity" = CASE 
    WHEN m."unit" IN ('M', 'KG') THEN 10000
    WHEN m."unit" IN ('UN', 'PEÇ', 'PAR', 'CJT', 'CDA', 'PI', 'CXT', 'RLL', 'KIT', 'JG', 'MM', 'NA') THEN 1000
    ELSE 0
END
FROM "Material" m
WHERE "Stock"."materialId" = m."id";