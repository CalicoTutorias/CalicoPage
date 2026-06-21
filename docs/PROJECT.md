# Calico Monitorias — Project Overview

> For architecture patterns and coding conventions see [PATTERNS.md](PATTERNS.md).
> For the full technical reference see [specs/technical.md](specs/technical.md).

## What is Calico?

Calico is a peer-tutoring marketplace for Colombian university students. Students find approved peer tutors by course, book sessions, and pay through the platform. Tutors manage their availability via Google Calendar, accept session requests, and receive 85% of each session's price. Calico handles moderation, pricing, and payments.

## Users

| Role | Description |
|---|---|
| **Student** | Searches tutors by course or name, books and pays for sessions, rates tutors |
| **Tutor** | Approved peer tutor — manages availability, accepts/cancels sessions, receives payouts to Bre-B |
| **Admin** | Moderates tutor applications, manages course prices, views platform analytics |

## Core Flows

### Student
1. Register → verify email → login
2. Search tutors by course or name
3. Pick a time slot from tutor's available blocks
4. Pay via Wompi → session created in `Pending` state
5. Tutor accepts → Google Meet link auto-created and emailed to both parties
6. Attend session → rate tutor once session is marked `Completed`

### Tutor
1. Register as student → fill application (motivation + subjects + Bre-B key)
2. Calico reviews → approves or rejects **per subject** (granular)
3. Set weekly availability blocks (or sync Google Calendar `disponibilidad` calendar)
4. Receive session requests → accept or cancel (must cancel ≥6h before session)
5. Mark session complete → student and tutor rate each other
6. Receive 85% of session price to Bre-B key

### Admin
1. Review pending tutor applications → approve/reject individual subjects
2. Suspend or reinstate active tutors
3. Manage course base prices
4. View platform analytics: sessions, revenue, retention cohorts, per-course profitability
5. Search user directory
6. All mutations are recorded in an immutable `admin_audit_log`

## Pricing Model

Calico sets all prices — tutors cannot set their own rates.

- Each course has a **base price per hour** stored in `CoursePrice` (or falls back to `Course.basePrice`)
- Session price = `price/hour × session duration in hours`
- **Split:** 85% to tutor, 15% to Calico (Wompi fees deducted from the Calico share)
- Break-even price where Calico covers Wompi fees: ~$7,032 COP

Single source of truth for the math: `src/lib/payments/fees.js`. Never re-implement `× 0.15` / `× 0.85` inline.

## Tutor Subject Approval

Approval is **granular per subject**, not all-or-nothing:
- Applicant selects subjects + uploads evidence per subject (grades, certificates, portfolio links)
- Admin approves or rejects each subject independently from the admin panel
- Approved subjects appear in `tutor_courses` with `status = Approved`
- Rejected subjects are communicated by Calico directly — no in-app rejection notification
- Existing tutors can request additional subjects later (same flow, labeled "Tutor Existente" in the email to admin)

## Cancellation Policy

| Scenario | Result |
|---|---|
| Student cancels ≥6h before | Full refund (Bre-B, Nequi, or platform credit) |
| Student cancels <6h before | No automatic refund — must contact support |
| Tutor cancels a confirmed session | Student receives automatic refund |
| Tutor no-show (student waits 10 min) | Full refund + incident logged against tutor |
| Admin suspends tutor | All future sessions `Canceled` with `cancellation_reason = TUTOR_SUSPENDED` |

Repeated tutor cancellations affect their rating and platform standing.

## Platform URLs

| Context | URL |
|---|---|
| Production | `calico-tutorias.com` |
| Student portal | `/home` |
| Tutor portal | `/home` (toggle via profile) |
| Admin panel | `/home/admin` |

## Contact & Support

| Channel | Value |
|---|---|
| Email | calico.tutorias@gmail.com |
| WhatsApp | +57 310 2906071 |
| Instagram | @calico.tutorias |

For urgent issues during a live session → WhatsApp. For bugs or feedback → email.
