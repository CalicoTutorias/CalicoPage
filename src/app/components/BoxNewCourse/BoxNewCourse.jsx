import React from "react";
import { BookOpen, ArrowRight } from "lucide-react";
import { useI18n } from "../../../lib/i18n";

const BoxNewCourse = ({ name, number }) => {
  const { t } = useI18n();
  return (
    <div className="group flex items-center justify-between bg-white border border-[#289656]/20 hover:border-[#289656]/60 rounded-xl px-4 py-4 cursor-pointer transition-all duration-200 hover:shadow-md hover:-translate-y-0.5">
      <div className="flex items-center gap-3 min-w-0">
        <div className="p-2 bg-[#289656]/10 rounded-lg flex-shrink-0 group-hover:bg-[#289656]/20 transition-colors">
          <BookOpen className="w-4 h-4 text-[#289656]" />
        </div>
        <div className="min-w-0">
          <p className="font-semibold text-[#1a3c2f] text-sm leading-tight truncate">{name}</p>
          <p className="text-xs text-gray-400 mt-0.5">
            {number} {number === 1 ? t('boxCourse.tutor') : t('boxCourse.tutors')}
          </p>
        </div>
      </div>
      <ArrowRight className="w-4 h-4 text-[#289656] flex-shrink-0 ml-2 opacity-0 group-hover:opacity-100 transition-opacity" />
    </div>
  );
};

export default BoxNewCourse;
