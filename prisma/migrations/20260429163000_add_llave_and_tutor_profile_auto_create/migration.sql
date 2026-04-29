-- Add payment key field for tutors
ALTER TABLE "tutor_profiles"
ADD COLUMN IF NOT EXISTS "llave" TEXT;

-- Automatically create/populate tutor_profiles when a user becomes approved tutor
CREATE OR REPLACE FUNCTION ensure_tutor_profile_on_approval()
RETURNS TRIGGER AS $$
DECLARE
  latest_reasons TEXT;
  latest_phone TEXT;
BEGIN
  IF NEW.is_tutor_approved = TRUE
     AND COALESCE(OLD.is_tutor_approved, FALSE) = FALSE THEN
    SELECT
      NULLIF(TRIM(ta.reasons_to_teach), ''),
      NULLIF(TRIM(ta.contact_info->>'phone'), '')
    INTO latest_reasons, latest_phone
    FROM tutor_applications ta
    WHERE ta.user_id = NEW.id
    ORDER BY ta.created_at DESC
    LIMIT 1;

    IF NEW.phone_number IS NULL AND latest_phone IS NOT NULL THEN
      NEW.phone_number := latest_phone;
    END IF;

    INSERT INTO tutor_profiles (
      user_id,
      school_email,
      llave,
      bio,
      experience_years,
      credits,
      experience_description,
      review,
      num_review,
      num_sessions,
      total_earning,
      next_payment,
      updated_at
    ) VALUES (
      NEW.id,
      NEW.email,
      NULL,
      NULL,
      NULL,
      0,
      latest_reasons,
      0,
      0,
      0,
      0,
      0,
      NOW()
    )
    ON CONFLICT (user_id) DO UPDATE
    SET
      school_email = COALESCE(tutor_profiles.school_email, EXCLUDED.school_email),
      experience_description = COALESCE(tutor_profiles.experience_description, EXCLUDED.experience_description),
      updated_at = NOW();
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_users_auto_create_tutor_profile ON users;

CREATE TRIGGER trg_users_auto_create_tutor_profile
BEFORE UPDATE OF is_tutor_approved ON users
FOR EACH ROW
EXECUTE FUNCTION ensure_tutor_profile_on_approval();
