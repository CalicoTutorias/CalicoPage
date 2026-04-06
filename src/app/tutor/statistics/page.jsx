"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import { useAuth } from "../../context/SecureAuthContext";
import { PaymentService } from "../../services/core/PaymentService";
import { UserService } from "../../services/core/UserService";
import {
  BarChart3,
  TrendingUp,
  DollarSign,
  Users,
  Calendar,
  ChevronDown,
  Eye
} from "lucide-react";
import "./Statistics.css";
import { useI18n } from "../../../lib/i18n";
import PageSectionHeader from "../../components/PageSectionHeader/PageSectionHeader";

/**
 * TutorStatistics
 *
 * Requisitos implementados:
 * - El filtro de cursos muestra SOLO los cursos que dicta el tutor (se obtienen desde /api/tutors/:id)
 * - Para cada courseId en el tutor, se consulta /api/courses/:id y se muestra course.name en filtro y en historial
 * - No se muestran IDs al usuario (solo nombres y correos)
 * - Si no hay tutor payments para un curso, igualmente aparece en el filtro (cumple "aparezcan aunque no haya tutorías")
 * - En el historial se muestra siempre el email del estudiante (si solo hay studentId intenta consultar perfil)
 *
 * Nota: las URLs de API usan rutas relativas para que funcionen en dev y prod
 */

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
    monthlyEarnings: [],
    monthlyCounts: []
  });
  const [payments, setPayments] = useState([]);
  const [transactions, setTransactions] = useState([]);

  // tutorCourses: array of { id, name } — todos los cursos que dicta el tutor (aunque no tenga pagos)
  const [tutorCourses, setTutorCourses] = useState([]);

  // Filters
  const [selectedCourse, setSelectedCourse] = useState("all"); // value will be course name (not id)
  const [selectedTimeframe, setSelectedTimeframe] = useState("year");
  const [selectedPeriod, setSelectedPeriod] = useState(() => {
    const now = new Date();
    const start = new Date(now.getFullYear(), 0, 1);
    const end = new Date(now.getFullYear(), 11, 31);
    const fmt = d =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
        d.getDate()
      ).padStart(2, "0")}`;
    return { start: fmt(start), end: fmt(end) };
  });

  // Helpers - memoized
  const parseDate = useCallback(value => {
    if (!value) return null;
    const d = value instanceof Date ? value : new Date(value);
    return isNaN(d.getTime()) ? null : d;
  }, []);

  const isPaidStatus = useCallback(status => {
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
        const qStartMonth = Math.floor(now.getMonth() / 3) * 3;
        start = new Date(now.getFullYear(), qStartMonth, 1);
        end = new Date(now.getFullYear(), qStartMonth + 3, 0);
        break;
      }
      case "year":
        // Show last 8 months instead of full year
        start = new Date(now.getFullYear(), now.getMonth() - 7, 1);
        end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
        break;
      case "all":
        start = new Date(1970, 0, 1);
        end = new Date(2100, 11, 31);
        break;
      default:
        start = new Date(now.getFullYear(), 0, 1);
        end = new Date(now.getFullYear(), 11, 31);
    }

    const fmt = d =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
        d.getDate()
      ).padStart(2, "0")}`;
    setSelectedPeriod({ start: fmt(start), end: fmt(end) });
  }, [selectedTimeframe]);

  // Load stats when user logged in or filters change
  useEffect(() => {
    if (user?.isLoggedIn && user?.email) {
      loadStatistics();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.isLoggedIn, user?.email, selectedCourse, selectedTimeframe, selectedPeriod]);

  // Fetch course name by id from backend /api/courses/:id
  const fetchCourseName = async courseId => {
    try {
      const res = await fetch(`${API_BASE}/courses/${courseId}`);
      if (!res.ok) throw new Error("No course");
      const json = await res.json();
      if (json?.success && json.course?.name) return json.course.name;
      return null;
    } catch (e) {
      console.warn("Failed to fetch course name for", courseId, e);
      return null;
    }
  };

  // Fetch tutor record from /api/tutors/:id to get tutor.courses (array of ids)
  const fetchTutorRecord = async tutorId => {
    try {
      const res = await fetch(`${API_BASE}/tutors/${tutorId}`);
      if (!res.ok) throw new Error("Tutor not found");
      const json = await res.json();
      if (json?.success && json.tutor) return json.tutor;
      return null;
    } catch (e) {
      console.warn("Failed to fetch tutor record", e);
      return null;
    }
  };

  const loadStatistics = async () => {
    try {
      setLoading(true);

      // 1) obtener perfil para tutorId (fallback: user.uid)
      const profileResult = await UserService.getUserById(user.uid);
      const tutorId = profileResult?.id || user.uid;

      if (!tutorId) {
        setLoading(false);
        return;
      }

      // 1b) obtener lista de cursos y rating desde /api/tutors/:id
      const tutorRecord = await fetchTutorRecord(tutorId);
      let tutorCourseIds = [];
      let rating = 0;
      
      if (tutorRecord && Array.isArray(tutorRecord.courses)) {
        tutorCourseIds = tutorRecord.courses.slice(); // array de ids
      }
      
      // Obtener rating del tutor_profiles.review
      if (tutorRecord && tutorRecord.rating !== undefined) {
        const r = tutorRecord.rating;
        const n = typeof r === "string" ? parseFloat(r) : r;
        rating = Number.isFinite(n) ? n : 0;
      }

      // 1c) resolver cada courseId -> name (usando /api/courses/:id)
      const courseMap = {}; // id -> name
      const tutorCoursesResolved = [];

      await Promise.all(
        tutorCourseIds.map(async courseId => {
          if (!courseId) return;
          const name = await fetchCourseName(courseId);
          const finalName = name || courseId; // si falla, usar id como fallback interno (no se mostrará al usuario)
          courseMap[String(courseId)] = finalName;
          tutorCoursesResolved.push({ id: courseId, name: finalName });
        })
      );

      // 2) traer pagos del servicio (se espera el JSON que enviaste anteriormente)
      let paymentsData = await PaymentService.getTutorPayments(tutorId);

      // fallback por email si el backend usa email en lugar de uid
      if ((!paymentsData || paymentsData.length === 0) && user.email) {
        const byEmail = await PaymentService.getTutorPayments(user.email);
        if (byEmail && byEmail.length > 0) paymentsData = byEmail;
      }

      paymentsData = Array.isArray(paymentsData) ? paymentsData : [];

      // 3) Collect unique student IDs that don't have an email
      const studentIdsToFetch = new Set();
      paymentsData.forEach(p => {
        if (!p.studentEmail && (p.studentId || p.student)) {
          studentIdsToFetch.add(p.studentId || p.student);
        }
      });

      const studentEmailMap = {};
      if (studentIdsToFetch.size > 0) {
        await Promise.all(
          Array.from(studentIdsToFetch).map(async sid => {
            try {
              const res = await UserService.getUserById(sid);
              if (res?.email) {
                studentEmailMap[sid] = res.email;
              }
            } catch (e) {
              console.error(`Failed to fetch profile for ${sid}`, e);
            }
          })
        );
      }

      // 4) Normalizar pagos
      const normalized = await Promise.all(
        paymentsData.map(async p => {
          let courseVal = p.course;
          let courseId = p.courseId;
          // Some payloads have 'course' as id, or as name - handle both
          if (courseVal && typeof courseVal === "object") {
            if (courseVal.name) courseVal = courseVal.name;
            else if (courseVal.title) courseVal = courseVal.title;
            else if (courseVal.id) {
              courseId = courseVal.id;
              courseVal = courseVal.id;
            }
          }

          // If the payment has a courseId and we resolved it earlier, prefer mapped name
          let finalCourseName = null;
          if (courseId && courseMap[String(courseId)]) {
            finalCourseName = courseMap[String(courseId)];
          } else if (courseVal && courseMap[String(courseVal)]) {
            finalCourseName = courseMap[String(courseVal)];
          } else if (typeof courseVal === "string" && courseVal.trim() !== "") {
            // It might already be a readable name
            finalCourseName = courseVal;
          } else if (p.notes && String(p.notes).trim()) {
            finalCourseName = String(p.notes);
          } else {
            // If not resolvable, try to fetch course name by using courseId if present and not in map
            if (courseId && !courseMap[String(courseId)]) {
              const fetchedName = await fetchCourseName(courseId);
              if (fetchedName) {
                courseMap[String(courseId)] = fetchedName;
                finalCourseName = fetchedName;
                // add to tutorCoursesResolved only if tutor actually has this id (we don't add randoms)
                if (tutorCourseIds.includes(courseId)) {
                  // ensure no dup
                  if (!tutorCoursesResolved.find(c => c.id === courseId)) {
                    tutorCoursesResolved.push({ id: courseId, name: fetchedName });
                  }
                }
              }
            }
          }

          // Last fallback: empty 'General'
          finalCourseName = finalCourseName || t("tutorStats.transactions.courseFallback", { defaultValue: "General" });

          // Resolve student email
          let studentEmail = p.studentEmail || p.studentEmailAddress || null;
          if (!studentEmail && (p.studentId || p.student) && studentEmailMap[p.studentId || p.student]) {
            studentEmail = studentEmailMap[p.studentId || p.student];
          }

          // If studentEmail still missing, try to use studentName or student field (no IDs shown)
          if (!studentEmail && p.studentName) {
            studentEmail = p.studentName;
          }

          return {
            ...p,
            course: finalCourseName,
            studentEmail: studentEmail,
            amount: Number(p.amount) || 0,
            pagado: isPaidStatus(p.status), // boolean
            method: p.paymentMethod || p.method || "",
            date_payment: parseDate(p.createdAt) || parseDate(p.date_payment) || null
          };
        })
      );

      // Save tutorCoursesResolved (unique by name) so filter shows courses even without payments
      // If a tutorCourse had no name (fallback to id), we still put a placeholder but prefer to show only when name exists.
      const uniqueTutorCourses = Array.from(
        new Map(
          tutorCoursesResolved.map(c => [String(c.id), { id: c.id, name: c.name }])
        ).values()
      );

      setTutorCourses(uniqueTutorCourses);
      setPayments(normalized);

      // filtrar según curso/periodo
      const filtered = filterPayments(normalized);

      // calcular estadisticas y transacciones
      const calculated = calculateStatistics(filtered);
      setStats({ ...calculated, averageRating: rating });

      const tx = generateTransactionHistory(filtered);
      setTransactions(tx);
    } catch (err) {
      console.error("Error loading statistics:", err);
    } finally {
      setLoading(false);
    }
  };

  const filterPayments = paymentsData => {
    let filtered = paymentsData;

    // filter by selectedCourse (selectedCourse is a course name string or "all")
    if (selectedCourse && selectedCourse !== "all") {
      filtered = filtered.filter(p => {
        return String(p.course || "").toLowerCase() === String(selectedCourse).toLowerCase();
      });
    }

    // Date filtering: skip when timeframe === 'all'
    if (selectedTimeframe !== "all") {
      const [sy, sm, sd] = selectedPeriod.start.split("-").map(Number);
      const [ey, em, ed] = selectedPeriod.end.split("-").map(Number);
      const startDate = new Date(sy, (sm || 1) - 1, sd || 1, 0, 0, 0, 0);
      const endDate = new Date(ey, (em || 1) - 1, ed || 1, 23, 59, 59, 999);

      filtered = filtered.filter(p => {
        const d = p.date_payment instanceof Date ? p.date_payment : parseDate(p.date_payment);
        if (!d) return false;
        return d >= startDate && d <= endDate;
      });
    }

    return filtered;
  };

  const calculateStatistics = paymentsData => {
    const totalSessions = paymentsData.length;
    const completedSessions = paymentsData.filter(p => p.pagado).length;
    const pendingSessions = paymentsData.filter(p => !p.pagado).length;

    const totalEarnings = paymentsData
      .filter(p => p.pagado)
      .reduce((s, p) => s + (Number(p.amount) || 0), 0);

    const nextPayment = paymentsData
      .filter(p => !p.pagado)
      .reduce((s, p) => s + (Number(p.amount) || 0), 0);

    const monthlyEarnings = calculateMonthlyEarnings(paymentsData, selectedPeriod);
    const monthlyCounts = calculateMonthlyCounts(paymentsData, selectedPeriod);

    return {
      totalSessions,
      completedSessions,
      pendingSessions,
      totalEarnings,
      nextPayment,
      averageRating: 0,
      monthlyEarnings,
      monthlyCounts
    };
  };

  // genera lista de meses entre start y end (incluye meses con 0)
  const buildMonthRange = (startIso, endIso) => {
    const start = parseDate(startIso);
    const end = parseDate(endIso);
    if (!start || !end) return [];

    const months = [];
    const cur = new Date(start.getFullYear(), start.getMonth(), 1);
    const last = new Date(end.getFullYear(), end.getMonth(), 1);

    while (cur <= last) {
      const monthName = cur.toLocaleString("default", { month: "short" });
      const key = `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, "0")}`;
      months.push({ key, month: `${monthName} ${cur.getFullYear()}` });
      cur.setMonth(cur.getMonth() + 1);
    }
    return months;
  };

  const calculateMonthlyEarnings = (paymentsData, period = selectedPeriod) => {
    // aggregate paid amounts
    const groups = {};
    paymentsData.forEach(p => {
      if (!p.pagado) return;
      const d = p.date_payment;
      if (!d) return;
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      groups[key] = (groups[key] || 0) + (Number(p.amount) || 0);
    });

    // ensure months exist in range
    const months = buildMonthRange(period.start, period.end);
    return months.map(m => ({ month: m.month, earnings: groups[m.key] || 0 }));
  };

  const calculateMonthlyCounts = (paymentsData, period = selectedPeriod) => {
    // Count ALL sessions/payments regardless of paid status (both pending and completed)
    const groups = {};
    paymentsData.forEach(p => {
      const d = p.date_payment;
      if (!d) return;
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      groups[key] = (groups[key] || 0) + 1;
    });

    const months = buildMonthRange(period.start, period.end);
    return months.map(m => ({ month: m.month, count: groups[m.key] || 0 }));
  };

  const generateTransactionHistory = paymentsData => {
    return paymentsData
      .map(p => {
        const date = p.date_payment || new Date();
        const courseLabel = p.course || t("tutorStats.transactions.courseFallback", { defaultValue: "General" });
        // student should be email or name, never raw id shown
        const studentDisplay = p.studentEmail || p.studentName || "";
        return {
          // key id remains for React but we won't display it
          id: `${(p.wompiTransactionId || "")}-${date?.toISOString() || ""}`,
          date,
          concept: t("tutorStats.transactions.conceptPrefix", { course: courseLabel }),
          student: studentDisplay,
          amount: Number(p.amount) || 0,
          statusCode:
            p.pagado ? "completed" : String(p.status || "").toLowerCase() === "failed" ? "failed" : "pending",
          status:
            p.pagado
              ? t("tutorStats.transactions.status.completed")
              : String(p.status || "").toLowerCase() === "failed"
              ? t("tutorStats.transactions.status.failed")
              : t("tutorStats.transactions.status.pending"),
          methodCode: normalizeMethod(p.method),
          method: p.method || p.paymentMethod || t("tutorStats.transactions.methodDefault")
        };
      })
      .sort((a, b) => new Date(b.date) - new Date(a.date));
  };

  const normalizeMethod = m => {
    const s = (m || "").toString().toLowerCase();
    if (s.includes("tarj") || s.includes("card")) return "card";
    if (s.includes("efect") || s.includes("cash")) return "cash";
    if (s.includes("nequi") || s.includes("banco") || s.includes("transfer") || s.includes("pse"))
      return "transfer";
    return "other";
  };

  // unique courses for payments only (but we also want to show tutorCourses)
  const paymentCourseNames = useMemo(() => {
    const s = new Set();
    payments.forEach(p => {
      if (p.course) s.add(p.course);
    });
    return Array.from(s);
  }, [payments]);

  // Build list for filter: combine tutorCourses (names) and any course names from payments (avoid duplicates)
  const coursesForFilter = useMemo(() => {
    const map = new Map();
    // add tutor courses first (ensures they appear even if no payments)
    tutorCourses.forEach(c => {
      if (c && c.name) map.set(String(c.name).toLowerCase(), c.name);
    });
    // add payment-derived course names
    paymentCourseNames.forEach(name => {
      if (name) map.set(String(name).toLowerCase(), name);
    });
    // return array of names sorted alphabetically
    return Array.from(map.values()).sort((a, b) => a.localeCompare(b));
  }, [tutorCourses, paymentCourseNames]);

  const getStatusColor = statusOrCode => {
    const code = ["completed", "pending", "failed"].includes(statusOrCode)
      ? statusOrCode
      : statusOrCode?.toString().toLowerCase().startsWith("comp")
      ? "completed"
      : statusOrCode?.toString().toLowerCase().startsWith("pend")
      ? "pending"
      : statusOrCode?.toString().toLowerCase().startsWith("fall") ||
        statusOrCode?.toString().toLowerCase().startsWith("fail")
      ? "failed"
      : "default";
    switch (code) {
      case "completed":
        return "status-completed";
      case "pending":
        return "status-pending";
      case "failed":
        return "status-failed";
      default:
        return "status-default";
    }
  };

  const getMethodIcon = methodOrCode => {
    const code = normalizeMethod(methodOrCode);
    switch (code) {
      case "transfer":
        return "";
      case "cash":
        return "💵";
      case "card":
        return "";
      default:
        return "";
    }
  };

  // Chart helpers
  const maxCount = Math.max(...(stats.monthlyCounts.map(m => m.count) || [0]), 1);

  if (loading) {
    return (
      <div className="statistics-container">
        <div className="loading-state">
          <div className="loading-spinner"></div>
          <p>{t("tutorStats.loading")}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="statistics-container">
      <PageSectionHeader
        titleClassName="page-section-title--inline"
        title={
          <>
            <BarChart3 className="page-section-header__title-icon" size={28} aria-hidden />
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
            <select value={selectedCourse} onChange={e => setSelectedCourse(e.target.value)}>
              <option value="all">{t("common.allCourses")}</option>
              {coursesForFilter.map(courseName => (
                <option key={courseName} value={courseName}>
                  {courseName}
                </option>
              ))}
            </select>
            <ChevronDown className="select-icon" />
          </div>
        </div>

        <div className="filter-group">
          <label className="filter-label">{t("common.period")}</label>
          <div className="filter-select">
            <select value={selectedTimeframe} onChange={e => setSelectedTimeframe(e.target.value)}>
              <option value="week">{t("common.week")}</option>
              <option value="month">{t("common.month")}</option>
              <option value="quarter">{t("common.quarter")}</option>
              <option value="year">{t("common.year")}</option>
              <option value="all">{t("common.allTime", { defaultValue: "Todo el tiempo" })}</option>
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
                onChange={e => setSelectedPeriod(prev => ({ ...prev, start: e.target.value }))}
                className="date-input"
              />
            </div>
            <div className="filter-group">
              <label className="filter-label">{t("common.to")}</label>
              <input
                type="date"
                value={selectedPeriod.end}
                onChange={e => setSelectedPeriod(prev => ({ ...prev, end: e.target.value }))}
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

      {/* Summary Cards */}
      <div className="summary-cards">
        <div className="stat-card">
          <div className="card-icon sessions">
            <BarChart3 size={24} />
          </div>
          <div className="card-content">
            <h3 className="card-title">{t("tutorStats.cards.totalSessions")}</h3>
            <p className="card-value">{stats.totalSessions}</p>
          </div>
        </div>

        <div className="stat-card">
          <div className="card-icon pending">
            <DollarSign size={24} />
          </div>
          <div className="card-content">
            <h3 className="card-title">{t("tutorStats.cards.nextPayment")}</h3>
            <p className="card-value">{formatCurrency(stats.nextPayment)}</p>
          </div>
        </div>

        <div className="stat-card">
          <div className="card-icon total">
            <TrendingUp size={24} />
          </div>
          <div className="card-content">
            <h3 className="card-title">{t("tutorStats.cards.totalEarnings")}</h3>
            <p className="card-value">{formatCurrency(stats.totalEarnings)}</p>
          </div>
        </div>

        <div className="stat-card">
          <div className="card-icon rating">
            <Users size={24} />
          </div>
          <div className="card-content">
            <h3 className="card-title">{t("tutorStats.cards.averageRating")}</h3>
            <p className="card-value">{(stats.averageRating || 0).toFixed(1)} ⭐</p>
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
            {stats.monthlyCounts.length === 0 && <div style={{ padding: "1rem" }}>{t("common.noData")}</div>}
            {stats.monthlyCounts.map((item, index) => (
              <div key={index} className="chart-bar-group">
                <div
                  className="chart-bar"
                  style={{
                    height: `${Math.max(5, (item.count / maxCount) * 100)}%`
                  }}
                  title={`${item.month}: ${item.count}`}
                >
                  <div className="bar-value">{item.count}</div>
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
            {transactions.map(transaction => (
              <div key={transaction.id} className="table-row">
                <div className="table-cell">{new Date(transaction.date).toLocaleDateString()}</div>
                <div className="table-cell">{transaction.concept}</div>
                <div className="table-cell student">{transaction.student}</div>
                <div className="table-cell amount">{formatCurrency(transaction.amount)}</div>
                <div className="table-cell">
                  <span className={`status-badge ${getStatusColor(transaction.statusCode || transaction.status)}`}>
                    {transaction.status}
                  </span>
                </div>
                <div className="table-cell">
                  <span className="method-badge">
                    {getMethodIcon(transaction.methodCode || transaction.method)} {transaction.method}
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
  );
}
