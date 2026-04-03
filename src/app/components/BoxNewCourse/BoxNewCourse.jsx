import React from "react";
import { BookOpen, ArrowRight } from "lucide-react";
import { useI18n } from "../../../lib/i18n";

const BoxNewCourse = ({ name, number, tone = "default" }) => {
  const { t } = useI18n();
  const isTutorTone = tone === "tutor";
  const border = isTutorTone
    ? "border-[#006bb3]/20 hover:border-[#006bb3]/60"
    : "border-[#289656]/20 hover:border-[#289656]/60";
  const iconWrap = isTutorTone
    ? "bg-[#006bb3]/10 group-hover:bg-[#006bb3]/20"
    : "bg-[#289656]/10 group-hover:bg-[#289656]/20";
  const iconColor = isTutorTone ? "text-[#006bb3]" : "text-[#289656]";
  const titleColor = isTutorTone ? "text-[#003d66]" : "text-[#1a3c2f]";
  const arrowColor = isTutorTone ? "text-[#006bb3]" : "text-[#289656]";

  return (
    <div className={`group flex items-center justify-between bg-white border ${border} rounded-xl px-4 py-4 cursor-pointer transition-all duration-200 hover:shadow-md hover:-translate-y-0.5`}>
      <div className="flex items-center gap-3 min-w-0">
        <div className={`p-2 ${iconWrap} rounded-lg flex-shrink-0 transition-colors`}>
          <BookOpen className={`w-4 h-4 ${iconColor}`} />
        </div>
        <div className="min-w-0">
          <p className={`font-semibold ${titleColor} text-sm leading-tight truncate`}>{name}</p>
          <p className="text-xs text-gray-400 mt-0.5">
            {number} {number === 1 ? t('boxCourse.tutor') : t('boxCourse.tutors')}
          </p>
        </div>
      </div>
      <ArrowRight className={`w-4 h-4 ${arrowColor} flex-shrink-0 ml-2 opacity-0 group-hover:opacity-100 transition-opacity`} />
    </div>
  );
};

export default BoxNewCourse;
