-- Verify the updated quantities
SELECT m."unit", COUNT(*) as material_count, SUM(s."quantity") as total_qty
FROM "Stock" s
JOIN "Material" m ON s."materialId" = m."id"
GROUP BY m."unit"
ORDER BY m."unit";