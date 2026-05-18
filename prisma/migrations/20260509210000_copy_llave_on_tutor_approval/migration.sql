-- Update the tutor-profile auto-create trigger to also copy `llave`
-- from the latest tutor_applications.contact_info JSON. The previous
-- version (20260429163000) only copied phone + reasons.

CREATE OR REPLACE FUNCTION ensure_tutor_profile_on_approval()
RETURNS TRIGGER AS $$
DECLARE
  latest_reasons TEXT;
  latest_phone TEXT;
  latest_llave TEXT;
BEGIN
  IF NEW.is_tutor_approved = TRUE
     AND COALESCE(OLD.is_tutor_approved, FALSE) = FALSE THEN
    SELECT
      NULLIF(TRIM(ta.reasons_to_teach), ''),
      NULLIF(TRIM(ta.contact_info->>'phone'), ''),
      NULLIF(TRIM(ta.contact_info->>'llave'), '')
    INTO latest_reasons, latest_phone, latest_llave
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
      latest_llave,
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
      llave = COALESCE(tutor_profiles.llave, EXCLUDED.llave),
      updated_at = NOW();
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
