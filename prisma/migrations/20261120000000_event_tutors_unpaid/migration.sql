-- Repasos cuyos tutores no cobran (p. ej. los dicta el equipo de Calico):
-- todo el recaudo neto queda para Calico y el repaso se realiza con cualquier
-- inscrito, sin mínimo por tutor. Los existentes siguen pagando como antes.

ALTER TABLE "events" ADD COLUMN "tutors_unpaid" BOOLEAN NOT NULL DEFAULT false;
