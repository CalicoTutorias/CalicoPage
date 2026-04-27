-- Update NULL phone_number values with valid 10-digit numbers
UPDATE users 
SET phone_number = '300' || LPAD((ROW_NUMBER() OVER (ORDER BY id))::TEXT, 7, '0')
WHERE phone_number IS NULL;
