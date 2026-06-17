-- Drop unused tables: topics and course_prices.
-- topics was never populated (no API endpoint existed to create them).
-- course_prices was empty in production; pricing now uses Course.basePrice directly.

DROP TABLE IF EXISTS "topics";
DROP TABLE IF EXISTS "course_prices";
