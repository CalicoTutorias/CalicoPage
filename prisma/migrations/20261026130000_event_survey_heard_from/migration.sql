-- Preguntas de marketing en la encuesta post-evento:
--  - heard_from (+ heard_from_detail cuando es "other"): ¿cómo te enteraste?
--  - would_recommend: ¿lo recomendarías? (solo quienes asistieron)
-- Texto plano con los valores de src/lib/events/survey-questions.js; null en
-- las respuestas anteriores a las preguntas. Solo aditiva.

-- AlterTable
ALTER TABLE "event_survey_responses" ADD COLUMN     "heard_from" TEXT,
ADD COLUMN     "heard_from_detail" TEXT,
ADD COLUMN     "would_recommend" TEXT;
