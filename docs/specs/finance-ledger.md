# Libro de movimientos (finanzas)

Responde tres preguntas que el dashboard no respondía: **cuánta plata tiene Calico** (caja por cuenta), **cuánto le debe a tutores y estudiantes** y **cuánto ganó** en un periodo. Pantalla: `/home/admin/finanzas`.

## Conceptos

| Concepto | Definición |
| --- | --- |
| Cuenta | Dónde está la plata: `WOMPI`, `BANK`, `CASH` (`finance_accounts`). `gmf_applies` = sus salidas causan 4x1000. |
| Fecha de corte | Desde ella todo movimiento entra al libro (`finance_settings.cutoff_date`). Solo se cambia mientras el libro está vacío. |
| Movimiento | Plata real que entra (`IN`) o sale (`OUT`) de una cuenta (`ledger_entries`). Solo se agrega: un trigger rechaza `UPDATE`/`DELETE`; se corrige con un `REVERSAL`. |
| Caja | Saldo inicial + entradas − salidas, por cuenta. |
| Por pagar | Lo devengado a tutores (sesiones ya ocurridas + repasos realizados) − lo transferido. |
| Comprometido | 85 % de tutorías pagadas que aún no ocurren + devoluciones de repasos pendientes. |
| Disponible | Caja − por pagar − comprometido. |
| Ganancia | Sesiones y repasos **cuando ocurren** (`fees.js`, `event-earnings.js`) − 4x1000 − gastos + otros ingresos ± ajustes. |

## Movimientos automáticos (proyectados)

`finance-ledger.service.syncLedger()` corre antes de cada lectura y crea lo que falte a partir de las filas que ya describen el dinero. Cada movimiento lleva una `source_key` única, así que reproyectar nunca duplica.

| Origen | Movimientos |
| --- | --- |
| `payments` pagado por Wompi | `SESSION_CHARGE` (IN, Wompi) + `WOMPI_FEE` (OUT, estimado) |
| `payments` manual pagado (comprobante) | `SESSION_CHARGE` (IN, cuenta de cobros manuales) |
| `payments.tutor_payout_status = paid` | `TUTOR_PAYOUT` (OUT, 85 % de `tutor_payout_base`, cuenta usada) |
| `payments.refund_status = Refunded` | `REFUND` (OUT, total o parcial) |
| `event_payments` | `EVENT_CHARGE` + `WOMPI_FEE`; `REFUND` si se devolvió |
| Inscripción confirmada de repaso manual | `EVENT_CHARGE` (IN, cuenta de cobros manuales) |
| `event_tutor_payouts` | `EVENT_TUTOR_PAYOUT` (OUT) |
| Toda salida de una cuenta con 4x1000 | `GMF` (OUT, `gmf_rate` × monto, estimado) |

Solo entran hechos con fecha ≥ corte. Los cursos de prueba (`TEST123`) entran a caja con `exclude_from_profit`.

## Movimientos manuales

`OPENING_BALANCE` (fechado en el corte), `EXPENSE` (con categoría), `OTHER_INCOME` (un aporte de capital se marca fuera de ganancia), `TRANSFER` (par OUT/IN con `transfer_group_id`), `ADJUSTMENT` (con motivo). Saldo inicial, gasto, otro ingreso y ajuste exigen comprobante.

## Comprobantes

`finance-proofs/{yyyy-mm}/{24 hex}.{png|jpg|webp|pdf}` en el bucket privado (`src/lib/finance/finance-proof.js`). Presign en `POST /api/admin/finance/proofs/presigned-url`; el servidor verifica el objeto (`headObject`) y lo etiqueta `confirmed` al registrarlo.

**Pagar a un tutor exige cuenta y comprobante** (lote semanal, pago individual y pagos de repasos). Una transferencia fechada antes del corte es historia: no lo exige y no entra al libro (así se marcan como pagados los pagos viejos al arrancar).

## Repasos (regla nueva)

Ver `src/lib/payments/event-earnings.js`: los tutores reciben `máx(n × M, 40 % × R)`, con `M` = mínimo por tutor (`events.tutor_min_payout`, 60 000/h × horas si no se definió) y `R` = recaudo − comisiones Wompi. El repaso solo se realiza si `R ≥ n × M`.

### Repasos ya realizados

La migración `20261116170000_event_earnings_rule` marca como `LEGACY` los repasos que ya terminaron: se leen con la regla vieja (60 000/h desde 8 inscritos + 70 % del excedente) y no aparecen como deuda, porque sus tutores ya se pagaron. Los demás (y los nuevos) usan la regla nueva.

## Por pagar a tutores

Es exactamente el "Total a transferir" de Pagos a tutores: tutorías (`payouts.service.listPendingPayoutsByTutor`) + repasos (`payouts.service.listEventPayouts`). Los repasos se pagan en Pagos a tutores → Repasos (ya no dentro de cada evento).

## API (admin)

`/api/admin/finance/{settings, accounts[/:id], categories[/:id], summary, entries[/:id/reverse | /:id/proof], proofs/presigned-url, session-refunds}`. Cambios en rutas existentes: `payouts/*/mark-paid` y `bulk-mark-paid` aceptan `accountId`, `paidAt`, `proofS3Key`; `events/:id/tutor-payouts` acepta `accountId`, `proofS3Key`; `events/:id/payments/:paymentId/refunded` acepta `amount` (parcial), `accountId`, `refundedAt`, `proofS3Key`.

## Arranque

1. `pnpm exec prisma migrate deploy` (migración `20261116000000_finance_ledger`, crea cuentas Wompi / Banco / Efectivo y categorías) y `pnpm db:generate`.
2. En Finanzas → Configuración: fecha de corte (primer día de un mes) y cuentas por defecto.
3. Registrar el saldo inicial de cada cuenta con su extracto.
4. Marcar como pagados, con su fecha real anterior al corte, los pagos a tutores que ya se hicieron.

## Pendiente (fase 3)

Conciliación y cierre de mes contra extractos; hoy se ajusta con movimientos `ADJUSTMENT`.
