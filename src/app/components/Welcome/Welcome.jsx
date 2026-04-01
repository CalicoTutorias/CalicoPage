"use client";

import { useI18n } from "../../../lib/i18n";
import { Sparkles, BookOpen, Calendar, GraduationCap } from "lucide-react";

const WelcomeBanner = ({ usuario, isTutor = false }) => {
  const { t } = useI18n();
  const saludo = usuario ? t('welcome.greetingWithName', { name: usuario }) : t('welcome.greeting');

  const gradient = isTutor
    ? "bg-gradient-to-br from-indigo-600 via-purple-600 to-violet-600"
    : "bg-gradient-to-br from-orange-500 via-amber-500 to-yellow-500";

  const accentColor = isTutor ? "bg-violet-400" : "bg-yellow-400";
  const accentIcon = isTutor ? "text-indigo-700" : "text-orange-600";
  const RightIcon = isTutor ? GraduationCap : BookOpen;

  return (
    <div className={`relative w-full overflow-hidden ${gradient} h-auto min-h-[280px] sm:min-h-[320px] md:h-[320px]`}>
      {/* Decorative elements */}
      <div className="absolute top-0 right-0 w-32 h-32 sm:w-48 sm:h-48 md:w-64 md:h-64 bg-white/10 rounded-full -translate-y-16 sm:-translate-y-24 md:-translate-y-32 translate-x-16 sm:translate-x-24 md:translate-x-32"></div>
      <div className="absolute bottom-0 left-0 w-24 h-24 sm:w-36 sm:h-36 md:w-48 md:h-48 bg-white/10 rounded-full translate-y-12 sm:translate-y-18 md:translate-y-24 -translate-x-12 sm:-translate-x-18 md:-translate-x-24"></div>
      <div className="absolute top-1/2 left-1/2 w-16 h-16 sm:w-24 sm:h-24 md:w-32 md:h-32 bg-white/5 rounded-full -translate-x-8 sm:-translate-x-12 md:-translate-x-16 -translate-y-8 sm:-translate-y-12 md:-translate-y-16"></div>

      {/* Floating icons */}
      <div className="absolute top-4 right-4 sm:top-8 sm:right-16 text-white/20">
        <RightIcon className="w-5 h-5 sm:w-6 sm:h-6 md:w-8 md:h-8 animate-pulse" />
      </div>
      <div className="absolute bottom-4 right-6 sm:bottom-8 sm:right-24 text-white/20">
        <Calendar className="w-4 h-4 sm:w-5 sm:h-5 md:w-6 md:h-6 animate-bounce" />
      </div>
      <div className="absolute top-8 left-4 sm:top-16 sm:left-16 text-white/20">
        <Sparkles className="w-4 h-4 sm:w-5 sm:h-5 md:w-6 md:h-6 animate-pulse" />
      </div>

      <div className="relative z-10 flex flex-col md:flex-row items-center justify-between px-4 sm:px-6 md:px-8 lg:px-16 text-white py-8 sm:py-10 md:py-12 min-h-[280px] sm:min-h-[320px] md:h-full">
        <div className="flex flex-col justify-center w-full md:w-2/3">
          {isTutor && (
            <div className="flex items-center gap-2 mb-3 sm:mb-4">
              <span className="inline-flex items-center gap-1.5 bg-white/20 backdrop-blur-sm border border-white/30 text-white text-xs font-semibold px-3 py-1 rounded-full tracking-wide uppercase">
                <GraduationCap className="w-3.5 h-3.5" />
                Tutor
              </span>
            </div>
          )}

          <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl xl:text-7xl font-bold mb-2 sm:mb-3 md:mb-4 leading-tight break-words">
            {saludo}
          </h1>
          <p className="text-sm sm:text-base md:text-lg lg:text-xl text-white/90 mb-4 sm:mb-5 md:mb-6 max-w-2xl">
            {isTutor
              ? "Tu espacio para gestionar tutorias, estudiantes y disponibilidad."
              : t('welcome.subtitle')}
          </p>
        </div>

        {/* Right side decorative content */}
        <div className="hidden md:flex items-center justify-center w-1/3">
          <div className="relative">
            <div className="w-24 h-24 lg:w-32 lg:h-32 bg-white/10 rounded-3xl backdrop-blur-sm flex items-center justify-center">
              <div className="w-18 h-18 lg:w-24 lg:h-24 bg-white/20 rounded-2xl flex items-center justify-center">
                <RightIcon className="w-8 h-8 lg:w-12 lg:h-12 text-white/80" />
              </div>
            </div>
            <div className={`absolute -top-2 -right-2 lg:-top-4 lg:-right-4 w-6 h-6 lg:w-8 lg:h-8 ${accentColor} rounded-full flex items-center justify-center`}>
              <Sparkles className={`w-3 h-3 lg:w-4 lg:h-4 ${accentIcon}`} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default WelcomeBanner;
