"use client";

import React, { useMemo, useState } from "react";
import PageSectionHeader from "../../components/PageSectionHeader/PageSectionHeader";
import { useI18n } from "../../../lib/i18n";
import "./TutorPagos.css";

const PERIODS = [
  { id: "week", labelKey: "tutorPayments.filters.week" },
  { id: "month", labelKey: "tutorPayments.filters.month" },
  { id: "quarter", labelKey: "tutorPayments.filters.quarter" },
  { id: "year", labelKey: "tutorPayments.filters.year" },
];

const MOCK_TRANSACCIONES = [
  {
    id: 1,
    fecha: "2024-01-15",
    concepto: "Tutoría Cálculo Diferencial",
    estudiante: "María García",
    monto: 50000,
    estado: "completado",
    metodo: "transferencia",
  },
  {
    id: 2,
    fecha: "2024-01-14",
    concepto: "Tutoría Física I",
    estudiante: "Carlos López",
    monto: 45000,
    estado: "completado",
    metodo: "efectivo",
  },
  {
    id: 3,
    fecha: "2024-01-13",
    concepto: "Tutoría Programación",
    estudiante: "Ana Rodríguez",
    monto: 35000,
    estado: "pendiente",
    metodo: "tarjeta",
  },
];

function statusPillClass(estado) {
  switch (estado) {
    case "completado":
      return "tutor-pagos-pill tutor-pagos-pill--ok";
    case "pendiente":
      return "tutor-pagos-pill tutor-pagos-pill--pending";
    case "fallido":
      return "tutor-pagos-pill tutor-pagos-pill--fail";
    default:
      return "tutor-pagos-pill tutor-pagos-pill--pending";
  }
}

export default function TutorPagos() {
  const { t, formatCurrency, formatDate } = useI18n();
  const [selectedPeriod, setSelectedPeriod] = useState("month");

  const { totalCompletado, totalPendiente } = useMemo(() => {
    const completado = MOCK_TRANSACCIONES.filter((x) => x.estado === "completado");
    const pendiente = MOCK_TRANSACCIONES.filter((x) => x.estado === "pendiente");
    return {
      totalCompletado: completado.reduce((s, x) => s + x.monto, 0),
      totalPendiente: pendiente.reduce((s, x) => s + x.monto, 0),
    };
  }, []);

  const balanceDisponibleMock = 385000;

  const statusLabel = (estado) => {
    switch (estado) {
      case "completado":
        return t("tutorPayments.status.completed");
      case "pendiente":
        return t("tutorPayments.status.pending");
      case "fallido":
        return t("tutorPayments.status.failed");
      default:
        return estado;
    }
  };

  const methodLabel = (metodo) => {
    const key = `tutorPayments.methods.${metodo}`;
    const label = t(key);
    return label === key ? metodo : label;
  };

  return (
    <div className="tutor-pagos-page">
      <PageSectionHeader
        title={t("tutorPayments.title")}
        subtitle={t("tutorPayments.subtitle")}
        actions={
          <button type="button" className="page-section-header__btn-primary">
            {t("tutorPayments.requestWithdrawal")}
          </button>
        }
      />

      <div className="tutor-pagos-summary" aria-label={t("tutorPayments.title")}>
        <div className="tutor-pagos-stat tutor-pagos-stat--accent">
          <span className="tutor-pagos-stat__label">
            {t("tutorPayments.cards.thisMonth")}
          </span>
          <span className="tutor-pagos-stat__value">
            {formatCurrency(totalCompletado)}
          </span>
        </div>
        <div className="tutor-pagos-stat">
          <span className="tutor-pagos-stat__label">
            {t("tutorPayments.cards.pending")}
          </span>
          <span className="tutor-pagos-stat__value">
            {formatCurrency(totalPendiente)}
          </span>
        </div>
        <div className="tutor-pagos-stat">
          <span className="tutor-pagos-stat__label">
            {t("tutorPayments.cards.platformFee")}
          </span>
          <span className="tutor-pagos-stat__value">8%</span>
        </div>
        <div className="tutor-pagos-stat">
          <span className="tutor-pagos-stat__label">
            {t("tutorPayments.cards.availableBalance")}
          </span>
          <span className="tutor-pagos-stat__value">
            {formatCurrency(balanceDisponibleMock)}
          </span>
        </div>
      </div>

      <section className="tutor-pagos-filters" aria-labelledby="tutor-pagos-filters-title">
        <h2 id="tutor-pagos-filters-title" className="tutor-pagos-section-title">
          {t("tutorPayments.filters.sectionTitle")}
        </h2>
        <p className="tutor-pagos-section-hint">
          {t("tutorPayments.filters.sectionHint")}
        </p>
        <div className="tutor-pagos-segment" role="group" aria-label={t("tutorPayments.filters.sectionTitle")}>
          {PERIODS.map(({ id, labelKey }) => (
            <button
              key={id}
              type="button"
              className={`tutor-pagos-segment__btn${selectedPeriod === id ? " tutor-pagos-segment__btn--active" : ""}`}
              onClick={() => setSelectedPeriod(id)}
              aria-pressed={selectedPeriod === id}
            >
              {t(labelKey)}
            </button>
          ))}
        </div>
      </section>

      <section className="tutor-pagos-panel" aria-labelledby="tutor-pagos-transactions-title">
        <div className="tutor-pagos-panel__head">
          <h2 id="tutor-pagos-transactions-title" className="tutor-pagos-section-title">
            {t("tutorPayments.transactions.title")}
          </h2>
        </div>
        <div className="tutor-pagos-table-scroll">
          <table className="tutor-pagos-table">
            <thead>
              <tr>
                <th scope="col">{t("tutorPayments.table.date")}</th>
                <th scope="col">{t("tutorPayments.table.concept")}</th>
                <th scope="col">{t("tutorPayments.table.student")}</th>
                <th scope="col">{t("tutorPayments.table.method")}</th>
                <th scope="col">{t("tutorPayments.table.status")}</th>
                <th scope="col" className="tutor-pagos-table__num">
                  {t("tutorPayments.table.amount")}
                </th>
                <th scope="col">{t("tutorPayments.table.actions")}</th>
              </tr>
            </thead>
            <tbody>
              {MOCK_TRANSACCIONES.map((row) => (
                <tr key={row.id}>
                  <td>{formatDate(row.fecha, { year: "numeric", month: "short", day: "numeric" })}</td>
                  <td>{row.concepto}</td>
                  <td>{row.estudiante}</td>
                  <td>{methodLabel(row.metodo)}</td>
                  <td>
                    <span className={statusPillClass(row.estado)}>{statusLabel(row.estado)}</span>
                  </td>
                  <td className="tutor-pagos-table__num">{formatCurrency(row.monto)}</td>
                  <td>
                    <button type="button" className="tutor-pagos-table__link">
                      {t("tutorPayments.transactions.viewDetails")}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="tutor-pagos-panel" aria-labelledby="tutor-pagos-settings-title">
        <div className="tutor-pagos-panel__head">
          <h2 id="tutor-pagos-settings-title" className="tutor-pagos-section-title">
            {t("tutorPayments.paymentSettings.title")}
          </h2>
        </div>
        <div className="tutor-pagos-settings-grid">
          <div className="tutor-pagos-card">
            <h3 className="tutor-pagos-card__title">
              {t("tutorPayments.paymentSettings.mainAccount")}
            </h3>
            <p className="tutor-pagos-card__line">
              {t("tutorPayments.paymentSettings.bank")} Bancolombia
            </p>
            <p className="tutor-pagos-card__line">
              {t("tutorPayments.paymentSettings.accountNumber")}{" "}
              {t("tutorPayments.paymentSettings.accountMasked")}
            </p>
            <button type="button" className="tutor-pagos-card__action">
              {t("tutorPayments.paymentSettings.editBankInfo")}
            </button>
          </div>
          <div className="tutor-pagos-card">
            <h3 className="tutor-pagos-card__title">
              {t("tutorPayments.paymentSettings.autoTitle")}
            </h3>
            <p className="tutor-pagos-card__line">
              {t("tutorPayments.paymentSettings.autoLine1")}
            </p>
            <p className="tutor-pagos-card__line">
              {t("tutorPayments.paymentSettings.autoLine2")}
            </p>
            <button type="button" className="tutor-pagos-card__action">
              {t("tutorPayments.paymentSettings.modifyConfiguration")}
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
