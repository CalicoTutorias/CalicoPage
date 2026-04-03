"use client";

import { useI18n } from "../../../lib/i18n";
import { BookOpen, Calendar, GraduationCap, BarChart3 } from "lucide-react";

const WelcomeBanner = ({ usuario, isTutor = false }) => {
  const { t } = useI18n();
  const saludo = usuario ? t("welcome.greetingWithName", { name: usuario }) : t("welcome.greeting");

  const gradient = isTutor
    ? "bg-gradient-to-br from-[#002a47] via-[#003d66] to-[#006bb3]"
    : "bg-gradient-to-br from-[#e85d04] via-[#ff9505] to-[#faa324]";

  const RightIcon = isTutor ? GraduationCap : BookOpen;
  const SecondaryIcon = isTutor ? BarChart3 : Calendar;

  return (
    <div
      className={`relative w-full overflow-hidden ${gradient} min-h-[240px] sm:min-h-[260px] md:min-h-[280px]`}
    >
      <div
        className="absolute inset-0 pointer-events-none opacity-[0.12]"
        style={{
          backgroundImage:
            "radial-gradient(circle at 20% 30%, rgba(255,255,255,0.45) 0%, transparent 45%), radial-gradient(circle at 80% 70%, rgba(255,255,255,0.2) 0%, transparent 40%)",
        }}
      />
      {/* Cuadrícula de puntos blancos: más marcada en naranja (estudiante) para igualar al banner verde */}
      <div
        className={`absolute inset-0 pointer-events-none ${
          isTutor ? "opacity-[0.15]" : "opacity-[0.35]"
        }`}
        style={{
          backgroundImage: isTutor
            ? "radial-gradient(circle, rgba(255,255,255,0.55) 1px, transparent 1px)"
            : "radial-gradient(circle, rgba(255,255,255,0.95) 1.25px, transparent 1.25px)",
          backgroundSize: "24px 24px",
        }}
      />
      <div className="absolute top-0 right-0 w-64 h-64 sm:w-80 sm:h-80 md:w-[28rem] md:h-[28rem] bg-white/[0.07] rounded-full -translate-y-28 translate-x-16 blur-2xl" />
      <div className="absolute bottom-0 left-0 w-48 h-48 sm:w-64 sm:h-64 bg-black/[0.12] rounded-full translate-y-16 -translate-x-12 blur-2xl" />

      <div className="absolute top-8 right-8 sm:top-10 sm:right-24 text-white/10">
        <RightIcon className="w-7 h-7 sm:w-10 sm:h-10 md:w-12 md:h-12" />
      </div>
      <div className="absolute bottom-10 right-32 sm:bottom-14 text-white/[0.08] hidden sm:block">
        <SecondaryIcon className="w-6 h-6 md:w-8 md:h-8" />
      </div>

      <div className="relative z-10 flex flex-col lg:flex-row items-stretch justify-between gap-6 px-5 sm:px-8 md:px-12 lg:px-16 py-8 sm:py-10 md:py-11 text-white">
        <div className="flex flex-col justify-center w-full lg:max-w-[58%] min-w-0">
          {isTutor ? (
            <div className="flex items-center gap-2 mb-3 sm:mb-4">
              <span className="inline-flex items-center gap-1.5 bg-white/20 border border-white/35 text-white text-[11px] sm:text-xs font-bold px-3 py-1.5 rounded-md tracking-wide uppercase shadow-sm">
                <GraduationCap className="w-3.5 h-3.5 shrink-0" />
                Tutor
              </span>
            </div>
          ) : (
            <div className="flex items-center gap-2 mb-3 sm:mb-4">
              <span className="inline-flex items-center gap-1.5 bg-black/20 border border-white/25 text-white text-[11px] sm:text-xs font-bold px-3 py-1.5 rounded-md tracking-wide uppercase shadow-sm backdrop-blur-sm">
                <BookOpen className="w-3.5 h-3.5 shrink-0" />
                Estudiante
              </span>
            </div>
          )}

          <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-[3.25rem] font-bold mb-3 sm:mb-4 leading-[1.12] tracking-tight break-words">
            {saludo}
          </h1>
          <p className="text-sm sm:text-base md:text-lg text-white/88 max-w-xl leading-relaxed">
            {isTutor ? t("welcome.tutorSubtitle") : t("welcome.subtitle")}
          </p>
        </div>

        
      </div>
    </div>
  );
};

export default WelcomeBanner;
