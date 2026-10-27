-- Update initial quantities based on unit type
-- M, KG = 10000
-- UN, PEÇ, PAR, CJT, CDA, PI, CXT, RLL, KIT, JG, MM, NA = 1000

UPDATE "Material" 
SET "initialQuantity" = CASE 
    WHEN "unit" IN ('M', 'KG') THEN 10000
    WHEN "unit" IN ('UN', 'PEÇ', 'PAR', 'CJT', 'CDA', 'PI', 'CXT', 'RLL', 'KIT', 'JG', 'MM', 'NA') THEN 1000
    ELSE 0
END;