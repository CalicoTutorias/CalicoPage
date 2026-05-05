"use client";

import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useAuth } from "../../context/SecureAuthContext";
import { PaymentService } from "../../services/core/PaymentService";
import { UserService } from "../../services/core/UserService";
import {
  BarChart3,
  TrendingUp,
  Wallet,
  Star,
  Calendar,
  ChevronDown,
  Eye,
  CalendarDays,
  MessageSquare,
} from "lucide-react";
import "./Statistics.css";
import { useI18n } from "../../../lib/i18n";
import PageSectionHeader from "../../components/PageSectionHeader/PageSectionHeader";

const API_BASE = "/api";

export default function TutorStatistics() {
  const { user } = useAuth();
  const { t, formatCurrency } = useI18n();

  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    totalSessions: 0,
    completedSessions: 0,
    pendingSessions: 0,
    totalEarnings: 0,
    nextPayment: 0,
    averageRating: 0,
    numReview: 0,
    monthlyEarnings: [],
    monthlyCounts: [],
  });

  // Raw normalized payments — set once on load, never re-fetched on filter changes
  const [payments, setPayments] = useState([]);
  const [transactions, setTransactions] = useState([]);
  // Tutor profile record (rating, numReview, totalEarning, nextPayment)
  const [tutorRecord, setTutorRecord] = useState(null);
  const [tutorCourses, setTutorCourses] = useState([]);

  // Filters
  const [selectedCourse, setSelectedCourse] = useState("all");
  const [selectedTimeframe, setSelectedTimeframe] = useState("year");
  const [selectedPeriod, setSelectedPeriod] = useState(() => {
    const now = new Date();
    const fmt = (d) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
        d.getDate()
      ).padStart(2, "0")}`;
    return {
      start: fmt(new Date(now.getFullYear(), 0, 1)),
      end: fmt(new Date(now.getFullYear(), 11, 31)),
    };
  });

  // ─── Helpers ──────────────────────────────────────────────────────────────

  const parseDate = useCallback((value) => {
    if (!value) return null;
    const d = value instanceof Date ? value : new Date(value);
    return isNaN(d.getTime()) ? null : d;
  }, []);

  const isPaidStatus = useCallback((status) => {
    const s = String(status || "").toLowerCase();
    return s === "paid" || s === "completed" || s === "aprobado" || s === "pagado";
  }, []);

  // Update selectedPeriod when timeframe changes (except custom)
  useEffect(() => {
    if (selectedTimeframe === "custom") return;
    const now = new Date();
    let start, end;
    switch (selectedTimeframe) {
      case "week":
        start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        end = now;
        break;
      case "month":
        start = new Date(now.getFullYear(), now.getMonth(), 1);
        end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
        break;
      case "quarter": {
        const qStart = Math.floor(now.getMonth() / 3) * 3;
        start = new Date(now.getFullYear(), qStart, 1);
        end = new Date(now.getFullYear(), qStart + 3, 0);
        break;
      }
      case "year":
        start = new Date(now.getFullYear(), 0, 1);
        end = new Date(now.getFullYear(), 11, 31);
        break;
      case "all":
        start = new Date(1970, 0, 1);
        end = new Date(2100, 11, 31);
        break;
      default:
        start = new Date(now.getFullYear(), 0, 1);
        end = new Date(now.getFullYear(), 11, 31);
    }
    const fmt = (d) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
        d.getDate()
      ).padStart(2, "0")}`;
    setSelectedPeriod({ start: fmt(start), end: fmt(end) });
  }, [selectedTimeframe]);

  // ─── Data fetching ────────────────────────────────────────────────────────

  const fetchCourseName = async (courseId) => {
    try {
      const res = await fetch(`${API_BASE}/courses/${courseId}`);
      if (!res.ok) return null;
      const json = await res.json();
      return json?.success && json.course?.name ? json.course.name : null;
    } catch {
      return null;
    }
  };

  const fetchTutorRecord = async (tutorId) => {
    try {
      const res = await fetch(`${API_BASE}/tutors/${tutorId}`);
      if (!res.ok) return null;
      const json = await res.json();
      return json?.success && json.tutor ? json.tutor : null;
    } catch {
      return null;
    }
  };

  // Fetch raw data from backend and cache in state.
  // This is only called when the user changes (not on filter changes).
  const loadRawData = useCallback(async () => {
    try {
      setLoading(true);

      const profileResult = await UserService.getUserById(user.uid);
      const tutorId = profileResult?.id || user.uid;
      if (!tutorId) return;

      const [tutorRec, rawPayments] = await Promise.all([
        fetchTutorRecord(tutorId),
        PaymentService.getTutorPayments(tutorId).catch(() => []),
      ]);

      // Normalize tutor record: API result takes precedence; fall back to auth context fields
      // so rating/numReview/earnings are never silently zero if the API call fails.
      const ctxProfile = user.tutorProfile ?? {};
      const normalizedTutorRec = {
        ...(tutorRec ?? {}),
        rating:
          Number(tutorRec?.rating ?? 0) ||
          Number(ctxProfile?.review ?? 0) ||
          0,
        numReview: tutorRec?.numReview ?? ctxProfile?.numReview ?? 0,
        totalEarning: Number(tutorRec?.totalEarning ?? ctxProfile?.totalEarning ?? 0),
        nextPayment: Number(tutorRec?.nextPayment ?? ctxProfile?.nextPayment ?? 0),
        courses: tutorRec?.courses ?? [],
      };

      let paymentsData = Array.isArray(rawPayments) ? rawPayments : [];

      // Fallback: try by email
      if (paymentsData.length === 0 && user.email) {
        const byEmail = await PaymentService.getTutorPayments(user.email).catch(() => []);
        if (Array.isArray(byEmail) && byEmail.length > 0) paymentsData = byEmail;
      }

      // Resolve course names
      const tutorCourseIds = Array.isArray(tutorRec?.courses) ? tutorRec.courses : [];
      const courseMap = {};
      const tutorCoursesResolved = [];

      await Promise.all(
        tutorCourseIds.map(async (courseId) => {
          if (!courseId) return;
          const name = await fetchCourseName(courseId);
          const finalName = name || courseId;
          courseMap[String(courseId)] = finalName;
          tutorCoursesResolved.push({ id: courseId, name: finalName });
        })
      );

      // Collect unknown student emails
      const studentIdsToFetch = new Set();
      paymentsData.forEach((p) => {
        if (!p.studentEmail && (p.studentId || p.student)) {
          studentIdsToFetch.add(p.studentId || p.student);
        }
      });

      const studentEmailMap = {};
      if (studentIdsToFetch.size > 0) {
        await Promise.all(
          Array.from(studentIdsToFetch).map(async (sid) => {
            try {
              const res = await UserService.getUserById(sid);
              if (res?.email) studentEmailMap[sid] = res.email;
            } catch {}
          })
        );
      }

      // Normalize payments
      const normalized = await Promise.all(
        paymentsData.map(async (p) => {
          let courseVal = p.course;
          let courseId = p.courseId;
          if (courseVal && typeof courseVal === "object") {
            if (courseVal.name) courseVal = courseVal.name;
            else if (courseVal.id) { courseId = courseVal.id; courseVal = courseVal.id; }
          }

          let finalCourseName = null;
          if (courseId && courseMap[String(courseId)]) {
            finalCourseName = courseMap[String(courseId)];
          } else if (courseVal && courseMap[String(courseVal)]) {
            finalCourseName = courseMap[String(courseVal)];
          } else if (typeof courseVal === "string" && courseVal.trim()) {
            finalCourseName = courseVal;
          } else if (courseId) {
            const fetched = await fetchCourseName(courseId);
            if (fetched) {
              courseMap[String(courseId)] = fetched;
              finalCourseName = fetched;
            }
          }
          finalCourseName =
            finalCourseName ||
            t("tutorStats.transactions.courseFallback", { defaultValue: "General" });

          let studentEmail =
            p.studentEmail || p.studentEmailAddress || null;
          if (!studentEmail && (p.studentId || p.student)) {
            studentEmail = studentEmailMap[p.studentId || p.student] || null;
          }
          if (!studentEmail && p.studentName) studentEmail = p.studentName;

          return {
            ...p,
            course: finalCourseName,
            studentEmail,
            amount: Number(p.amount) || 0,
            status: String(p.status || "pending").toLowerCase(),
            pagado: isPaidStatus(p.status),
            method: p.paymentMethod || p.method || "",
            date_payment: parseDate(p.createdAt) || parseDate(p.date_payment) || null,
          };
        })
      );

      const uniqueTutorCourses = Array.from(
        new Map(tutorCoursesResolved.map((c) => [String(c.id), c])).values()
      );

      setTutorRecord(normalizedTutorRec);
      setTutorCourses(uniqueTutorCourses);
      setPayments(normalized);
    } catch (err) {
      console.error("Error loading statistics:", err);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.uid, user?.email]);

  // Fetch raw data only when user identity changes
  useEffect(() => {
    if (user?.isLoggedIn && user?.email) {
      loadRawData();
    }
  }, [user?.isLoggedIn, user?.email, loadRawData]);

  // ─── Filter helpers ────────────────────────────────────────────────────────

  const buildMonthRange = useCallback(
    (startIso, endIso) => {
      const start = parseDate(startIso);
      const end = parseDate(endIso);
      if (!start || !end) return [];
      const months = [];
      const cur = new Date(start.getFullYear(), start.getMonth(), 1);
      const last = new Date(end.getFullYear(), end.getMonth(), 1);
      while (cur <= last) {
        const monthName = cur.toLocaleString("default", { month: "short" });
        months.push({
          key: `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, "0")}`,
          month: `${monthName} ${cur.getFullYear()}`,
        });
        cur.setMonth(cur.getMonth() + 1);
      }
      return months;
    },
    [parseDate]
  );

  const filterPayments = useCallback(
    (paymentsData) => {
      let filtered = paymentsData;

      if (selectedCourse && selectedCourse !== "all") {
        filtered = filtered.filter(
          (p) =>
            String(p.course || "").toLowerCase() ===
            String(selectedCourse).toLowerCase()
        );
      }

      if (selectedTimeframe !== "all") {
        const [sy, sm, sd] = selectedPeriod.start.split("-").map(Number);
        const [ey, em, ed] = selectedPeriod.end.split("-").map(Number);
        const startDate = new Date(sy, (sm || 1) - 1, sd || 1, 0, 0, 0, 0);
        const endDate = new Date(ey, (em || 1) - 1, ed || 1, 23, 59, 59, 999);

        filtered = filtered.filter((p) => {
          const d =
            p.date_payment instanceof Date ? p.date_payment : parseDate(p.date_payment);
          if (!d) return false;
          return d >= startDate && d <= endDate;
        });
      }

      return filtered;
    },
    [selectedCourse, selectedTimeframe, selectedPeriod, parseDate]
  );

  const calculateMonthlyEarnings = useCallback(
    (paymentsData, period) => {
      const groups = {};
      paymentsData.forEach((p) => {
        if (!p.pagado) return;
        const d = p.date_payment;
        if (!d) return;
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
        groups[key] = (groups[key] || 0) + (Number(p.amount) || 0);
      });
      const months = buildMonthRange(period.start, period.end);
      return months.map((m) => ({ month: m.month, earnings: groups[m.key] || 0 }));
    },
    [buildMonthRange]
  );

  // Chart counts ALL tutoring sessions (pending + paid), not just paid ones
  const calculateMonthlyCounts = useCallback(
    (paymentsData, period) => {
      const groups = {};
      paymentsData.forEach((p) => {
        // Only count confirmed sessions (not failed payments)
        if (p.status === "failed" || p.status === "fail") return;
        const d = p.date_payment;
        if (!d) return;
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
        groups[key] = (groups[key] || 0) + 1;
      });
      const months = buildMonthRange(period.start, period.end);
      return months.map((m) => ({ month: m.month, count: groups[m.key] || 0 }));
    },
    [buildMonthRange]
  );

  const calculateStatistics = useCallback(
    (paymentsData, tRecord) => {
      // Count only confirmed sessions (not failed)
      const confirmed = paymentsData.filter(
        (p) => p.status !== "failed" && p.status !== "fail"
      );
      const totalSessions = confirmed.length;
      const completedSessions = confirmed.filter((p) => p.pagado).length;
      const pendingSessions = confirmed.filter((p) => !p.pagado).length;

      // Compute money totals from payments data so they reflect actual payments
      // even if tutor_profiles columns were not yet incremented (e.g. legacy records).
      const totalEarnings = confirmed
        .filter((p) => p.pagado)
        .reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
      const nextPayment = confirmed
        .filter((p) => !p.pagado)
        .reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
      const averageRating = Number(tRecord?.rating ?? 0);
      const numReview = Number(tRecord?.numReview ?? 0);

      const monthlyEarnings = calculateMonthlyEarnings(paymentsData, selectedPeriod);
      const monthlyCounts = calculateMonthlyCounts(paymentsData, selectedPeriod);

      return {
        totalSessions,
        completedSessions,
        pendingSessions,
        totalEarnings,
        nextPayment,
        averageRating,
        numReview,
        monthlyEarnings,
        monthlyCounts,
      };
    },
    [selectedPeriod, calculateMonthlyEarnings, calculateMonthlyCounts]
  );

  const generateTransactionHistory = useCallback(
    (paymentsData) => {
      return paymentsData
        .map((p) => {
          const date = p.date_payment || new Date();
          const courseLabel =
            p.course ||
            t("tutorStats.transactions.courseFallback", { defaultValue: "General" });
          const studentDisplay = p.studentEmail || p.studentName || "";
          return {
            id: `${p.wompiTransactionId || ""}-${date?.toISOString?.() || ""}`,
            date,
            concept: t("tutorStats.transactions.conceptPrefix", { course: courseLabel }),
            student: studentDisplay,
            amount: Number(p.amount) || 0,
            statusCode:
              p.pagado
                ? "completed"
                : p.status === "failed" || p.status === "fail"
                ? "failed"
                : "pending",
            status:
              p.pagado
                ? t("tutorStats.transactions.status.completed")
                : p.status === "failed" || p.status === "fail"
                ? t("tutorStats.transactions.status.failed")
                : t("tutorStats.transactions.status.pending"),
            methodCode: normalizeMethod(p.method),
            method: p.method || p.paymentMethod || t("tutorStats.transactions.methodDefault"),
          };
        })
        .sort((a, b) => new Date(b.date) - new Date(a.date));
    },
    [t]
  );

  // Re-apply filters whenever filters or raw data changes — no backend calls
  useEffect(() => {
    if (payments.length === 0 && !tutorRecord) return;
    const filtered = filterPayments(payments);
    const calculated = calculateStatistics(filtered, tutorRecord);
    setStats(calculated);
    setTransactions(generateTransactionHistory(filtered));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCourse, selectedTimeframe, selectedPeriod, payments, tutorRecord]);

  // ─── Display helpers ───────────────────────────────────────────────────────

  const normalizeMethod = (m) => {
    const s = (m || "").toString().toLowerCase();
    if (s.includes("tarj") || s.includes("card")) return "card";
    if (s.includes("efect") || s.includes("cash")) return "cash";
    if (
      s.includes("nequi") ||
      s.includes("banco") ||
      s.includes("transfer") ||
      s.includes("pse")
    )
      return "transfer";
    return "other";
  };

  const paymentCourseNames = useMemo(() => {
    const s = new Set();
    payments.forEach((p) => { if (p.course) s.add(p.course); });
    return Array.from(s);
  }, [payments]);

  const coursesForFilter = useMemo(() => {
    const map = new Map();
    tutorCourses.forEach((c) => { if (c?.name) map.set(String(c.name).toLowerCase(), c.name); });
    paymentCourseNames.forEach((name) => { if (name) map.set(String(name).toLowerCase(), name); });
    return Array.from(map.values()).sort((a, b) => a.localeCompare(b));
  }, [tutorCourses, paymentCourseNames]);

  const getStatusColor = (code) => {
    const c = ["completed", "pending", "failed"].includes(code)
      ? code
      : String(code || "").toLowerCase().startsWith("comp")
      ? "completed"
      : String(code || "").toLowerCase().startsWith("pend")
      ? "pending"
      : String(code || "").toLowerCase().startsWith("fail")
      ? "failed"
      : "default";
    return `status-${c === "default" ? "default" : c}`;
  };

  const getMethodIcon = (m) => {
    switch (normalizeMethod(m)) {
      case "transfer": return "";
      case "cash": return "";
      case "card": return "";
      default: return "";
    }
  };

  const maxCount = Math.max(...(stats.monthlyCounts.map((m) => m.count) || [0]), 1);

  if (loading) {
    return (
      <div className="statistics-container statistics-page">
        <div className="statistics-inner">
          <div className="loading-state">
            <div className="loading-spinner"></div>
            <p>{t("tutorStats.loading")}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="statistics-container statistics-page">
      <div className="statistics-inner">
        <PageSectionHeader
          titleClassName="page-section-title--inline"
          title={
            <>
              <BarChart3
                className="page-section-header__title-icon statistics-page__title-icon"
                size={26}
                strokeWidth={2}
                aria-hidden
              />
              {t("tutorStats.title")}
            </>
          }
          subtitle={t("tutorStats.subtitle")}
        />

        {/* Filters */}
        <div className="filters-section">
          <div className="filter-group">
            <label className="filter-label">{t("tutorStats.filters.course")}</label>
            <div className="filter-select">
              <select
                value={selectedCourse}
                onChange={(e) => setSelectedCourse(e.target.value)}
              >
                <option value="all">{t("common.allCourses")}</option>
                {coursesForFilter.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
              <ChevronDown className="select-icon" />
            </div>
          </div>

          <div className="filter-group">
            <label className="filter-label">{t("common.period")}</label>
            <div className="filter-select">
              <select
                value={selectedTimeframe}
                onChange={(e) => setSelectedTimeframe(e.target.value)}
              >
                <option value="week">{t("common.week")}</option>
                <option value="month">{t("common.month")}</option>
                <option value="quarter">{t("common.quarter")}</option>
                <option value="year">{t("common.year")}</option>
                <option value="all">
                  {t("common.allTime", { defaultValue: "Todo el tiempo" })}
                </option>
                <option value="custom">{t("common.custom")}</option>
              </select>
              <ChevronDown className="select-icon" />
            </div>
          </div>

          {selectedTimeframe === "custom" && (
            <>
              <div className="filter-group">
                <label className="filter-label">{t("common.from")}</label>
                <input
                  type="date"
                  value={selectedPeriod.start}
                  onChange={(e) =>
                    setSelectedPeriod((prev) => ({ ...prev, start: e.target.value }))
                  }
                  className="date-input"
                />
              </div>
              <div className="filter-group">
                <label className="filter-label">{t("common.to")}</label>
                <input
                  type="date"
                  value={selectedPeriod.end}
                  onChange={(e) =>
                    setSelectedPeriod((prev) => ({ ...prev, end: e.target.value }))
                  }
                  className="date-input"
                />
              </div>
            </>
          )}
        </div>

        {/* Date Range Display */}
        <div className="date-range-display">
          {selectedPeriod.start === selectedPeriod.end
            ? new Date(selectedPeriod.start).toLocaleDateString("es-ES")
            : `${new Date(selectedPeriod.start).toLocaleDateString("es-ES")} - ${new Date(
                selectedPeriod.end
              ).toLocaleDateString("es-ES")}`}
        </div>

        {/* Summary Cards — 5 cards */}
        <div className="summary-cards">
          <div className="stat-card">
            <div className="card-icon sessions">
              <CalendarDays size={22} strokeWidth={2} aria-hidden />
            </div>
            <div className="card-content">
              <h3 className="card-title">{t("tutorStats.cards.totalSessions")}</h3>
              <p className="card-value">{stats.totalSessions}</p>
            </div>
          </div>

          <div className="stat-card">
            <div className="card-icon rating">
              <Star size={22} strokeWidth={2} aria-hidden />
            </div>
            <div className="card-content">
              <h3 className="card-title">{t("tutorStats.cards.averageRating")}</h3>
              <p className="card-value">{(stats.averageRating || 0).toFixed(1)}</p>
            </div>
          </div>

          <div className="stat-card">
            <div className="card-icon reviews">
              <MessageSquare size={22} strokeWidth={2} aria-hidden />
            </div>
            <div className="card-content">
              <h3 className="card-title">
                {t("tutorStats.cards.numReview", { defaultValue: "Reseñas" })}
              </h3>
              <p className="card-value">{stats.numReview}</p>
            </div>
          </div>

          <div className="stat-card">
            <div className="card-icon pending">
              <Wallet size={22} strokeWidth={2} aria-hidden />
            </div>
            <div className="card-content">
              <h3 className="card-title">{t("tutorStats.cards.nextPayment")}</h3>
              <p className="card-value">{formatCurrency(stats.nextPayment)}</p>
            </div>
          </div>

          <div className="stat-card">
            <div className="card-icon total">
              <TrendingUp size={22} strokeWidth={2} aria-hidden />
            </div>
            <div className="card-content">
              <h3 className="card-title">{t("tutorStats.cards.totalEarnings")}</h3>
              <p className="card-value">{formatCurrency(stats.totalEarnings)}</p>
            </div>
          </div>
        </div>

        {/* Chart Section */}
        <div className="chart-section">
          <div className="chart-header">
            <h2 className="chart-title">{t("tutorStats.charts.sessionsByMonth")}</h2>
            <button className="chart-action-btn">
              <Eye size={16} />
              {t("tutorStats.charts.viewDetails")}
            </button>
          </div>

          <div className="chart-container">
            <div className="chart-bars">
              {stats.monthlyCounts.length === 0 && (
                <div style={{ padding: "1rem" }}>{t("common.noData")}</div>
              )}
              {stats.monthlyCounts.map((item, index) => (
                <div key={index} className="chart-bar-group">
                  <div className="bar-value" title={`${item.month}: ${item.count}`}>
                    {item.count}
                  </div>
                  <div className="chart-bar-track">
                    <div
                      className="chart-bar"
                      style={{
                        height: `${Math.max(4, (item.count / maxCount) * 100)}%`,
                      }}
                      title={`${item.month}: ${item.count}`}
                    />
                  </div>
                  <span className="bar-label">{item.month}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Transaction History */}
        <div className="transactions-section">
          <div className="section-header">
            <h2 className="section-title">{t("tutorStats.transactions.title")}</h2>
            <p className="section-subtitle">{t("tutorStats.transactions.subtitle")}</p>
          </div>

          <div className="transactions-table">
            <div className="table-header">
              <div className="table-cell">{t("tutorStats.transactions.columns.date")}</div>
              <div className="table-cell">{t("tutorStats.transactions.columns.concept")}</div>
              <div className="table-cell">{t("tutorStats.transactions.columns.student")}</div>
              <div className="table-cell">{t("tutorStats.transactions.columns.amount")}</div>
              <div className="table-cell">{t("tutorStats.transactions.columns.status")}</div>
              <div className="table-cell">{t("tutorStats.transactions.columns.method")}</div>
            </div>

            <div className="table-body">
              {transactions.map((tx) => (
                <div key={tx.id} className="table-row">
                  <div
                    className="table-cell"
                    data-label={t("tutorStats.transactions.columns.date")}
                  >
                    {new Date(tx.date).toLocaleDateString()}
                  </div>
                  <div
                    className="table-cell"
                    data-label={t("tutorStats.transactions.columns.concept")}
                  >
                    {tx.concept}
                  </div>
                  <div
                    className="table-cell student"
                    data-label={t("tutorStats.transactions.columns.student")}
                  >
                    {tx.student}
                  </div>
                  <div
                    className="table-cell amount"
                    data-label={t("tutorStats.transactions.columns.amount")}
                  >
                    {formatCurrency(tx.amount)}
                  </div>
                  <div
                    className="table-cell"
                    data-label={t("tutorStats.transactions.columns.status")}
                  >
                    <span
                      className={`status-badge ${getStatusColor(tx.statusCode || tx.status)}`}
                    >
                      {tx.status}
                    </span>
                  </div>
                  <div
                    className="table-cell"
                    data-label={t("tutorStats.transactions.columns.method")}
                  >
                    <span className="method-badge">
                      {getMethodIcon(tx.methodCode || tx.method)} {tx.method}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {transactions.length === 0 && (
            <div className="empty-state">
              <Calendar size={48} />
              <h3>{t("common.noTransactions")}</h3>
              <p>{t("common.transactionsAppearAfter")}</p>
              {payments.length > 0 && (
                <div style={{ marginTop: "1rem", color: "orange", fontSize: "0.9rem" }}>
                  {t("tutorStats.filters.hiddenByFilters", { count: payments.length })}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
