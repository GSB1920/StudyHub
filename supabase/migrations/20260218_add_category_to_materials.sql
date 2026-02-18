-- Add category column to materials table
ALTER TABLE public.materials ADD COLUMN IF NOT EXISTS category text;

-- Backfill existing data with categories based on type
UPDATE public.materials SET category = 
  CASE 
    WHEN type = 'pdf' THEN 'Study Materials (PDFs)'
    WHEN type = 'test' THEN 'Test Series'
    WHEN type = 'sheet' THEN 'Cheat Sheets & Practice'
    ELSE 'General'
  END
WHERE category IS NULL;
