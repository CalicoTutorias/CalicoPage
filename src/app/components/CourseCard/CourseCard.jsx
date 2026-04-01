'use client';

import React, { useState } from 'react';
import { Button } from '../../../components/ui/button';
import { useI18n } from '../../../lib/i18n';
import { X, BookOpen, Users, Tag, GraduationCap } from 'lucide-react';

const COMPLEXITY_COLORS = {
    Introductory: 'bg-green-100 text-green-700',
    Foundational: 'bg-blue-100 text-blue-700',
    Challenging: 'bg-orange-100 text-orange-700',
};

function formatPrice(price) {
    if (!price) return null;
    return Number(price).toLocaleString('es-CO', { minimumFractionDigits: 0 });
}

export default function CourseCard({ course, onFindTutor }) {
    const { t } = useI18n();
    const [showModal, setShowModal] = useState(false);

    const c = typeof course === 'string'
        ? { name: course, code: course }
        : course || {};

    const displayName = c.nombre || c.name || c.codigo || c.code || 'Materia';
    const displayCode = c.codigo || c.code || '';
    const topics = c.topics || [];
    const tutorCount = c._count?.tutorCourses ?? null;
    const complexity = c.complexity || '';
    const basePrice = c.base_price || c.basePrice;
    const complexityColor = COMPLEXITY_COLORS[complexity] || 'bg-gray-100 text-gray-600';
    const formattedPrice = formatPrice(basePrice);

    return (
        <>
            <div className="bg-[#FEF9F6] rounded-xl px-5 py-4 max-w-[1100px] mx-auto border border-orange-100/50 hover:shadow-md transition-all duration-300">
                {/* Badges row */}
                {(complexity || displayCode) && (
                    <div className="flex flex-wrap items-center gap-2 mb-2">
                        {complexity && (
                            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${complexityColor}`}>
                                {t(`courseCard.complexity.${complexity}`)}
                            </span>
                        )}
                        {displayCode && (
                            <span className="text-xs font-mono text-gray-400 bg-gray-100 px-2 py-0.5 rounded">
                                {displayCode}
                            </span>
                        )}
                    </div>
                )}

                {/* Name + price */}
                <div className="flex flex-wrap items-baseline gap-2 mb-1">
                    <h3 className="text-xl font-semibold text-gray-900">{displayName}</h3>
                    {formattedPrice && (
                        <span className="text-sm font-medium text-[#A05E03]">${formattedPrice}</span>
                    )}
                </div>

                {/* Meta info */}
                <div className="flex flex-wrap gap-4 text-sm text-gray-500 mb-3">
                    {topics.length > 0 && (
                        <span className="flex items-center gap-1">
                            <BookOpen size={13} />
                            {t('courseCard.topicsCount', { count: topics.length })}
                        </span>
                    )}
                    {tutorCount !== null && (
                        <span className="flex items-center gap-1">
                            <Users size={13} />
                            {t('courseCard.tutorsCount', { count: tutorCount })}
                        </span>
                    )}
                </div>

                {/* Actions */}
                <div className="flex items-center gap-3">
                    <Button
                        onClick={onFindTutor}
                        className="bg-[#FF9500] hover:bg-[#FF8000] text-black px-5 py-1.5 rounded-full font-medium text-sm h-auto"
                    >
                        {t('courseCard.findTutor')}
                    </Button>
                    <button
                        onClick={() => setShowModal(true)}
                        className="text-sm font-medium text-[#FF9500] hover:text-[#FF8000] transition-colors underline underline-offset-2"
                    >
                        {t('courseCard.viewDetails')}
                    </button>
                </div>
            </div>

            {/* Details Modal */}
            {showModal && (
                <div
                    className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
                    onClick={(e) => { if (e.target === e.currentTarget) setShowModal(false); }}
                >
                    <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full max-h-[85vh] overflow-y-auto">
                        {/* Modal header */}
                        <div className="flex items-start justify-between p-6 pb-4 border-b border-gray-100">
                            <div className="flex-1 min-w-0 mr-4">
                                <div className="flex flex-wrap items-center gap-2 mb-1">
                                    {complexity && (
                                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${complexityColor}`}>
                                            {t(`courseCard.complexity.${complexity}`)}
                                        </span>
                                    )}
                                    {displayCode && (
                                        <span className="text-xs font-mono text-gray-400">{displayCode}</span>
                                    )}
                                </div>
                                <h2 className="text-xl font-bold text-gray-900 break-words">{displayName}</h2>
                            </div>
                            <button
                                onClick={() => setShowModal(false)}
                                className="text-gray-400 hover:text-gray-600 flex-shrink-0 mt-1"
                            >
                                <X size={20} />
                            </button>
                        </div>

                        {/* Stats */}
                        <div className="p-6 space-y-5">
                            <div className="grid grid-cols-2 gap-3">
                                <div className="bg-[#FEF9F6] rounded-xl p-4 flex flex-col items-center text-center">
                                    <Users size={20} className="text-[#FF9500] mb-1" />
                                    <span className="text-2xl font-bold text-gray-900">
                                        {tutorCount ?? '—'}
                                    </span>
                                    <span className="text-xs text-gray-500 mt-0.5">
                                        {t('courseCard.modal.tutorsAvailable')}
                                    </span>
                                </div>
                                <div className="bg-[#FEF9F6] rounded-xl p-4 flex flex-col items-center text-center">
                                    <BookOpen size={20} className="text-[#FF9500] mb-1" />
                                    <span className="text-2xl font-bold text-gray-900">{topics.length}</span>
                                    <span className="text-xs text-gray-500 mt-0.5">
                                        {t('courseCard.modal.topicsAvailable')}
                                    </span>
                                </div>
                            </div>

                            {/* Base price */}
                            {formattedPrice && (
                                <div className="flex items-center gap-2 text-sm">
                                    <Tag size={15} className="text-[#FF9500] flex-shrink-0" />
                                    <span className="text-gray-600">{t('courseCard.modal.basePrice')}:</span>
                                    <span className="font-semibold text-[#A05E03]">${formattedPrice}</span>
                                </div>
                            )}

                            {/* Topics */}
                            {topics.length > 0 && (
                                <div>
                                    <h4 className="text-sm font-semibold text-gray-700 mb-2">
                                        {t('courseCard.modal.topicsTitle')}
                                    </h4>
                                    <div className="flex flex-wrap gap-2">
                                        {topics.map((topic) => (
                                            <span
                                                key={topic.id}
                                                className="bg-orange-50 text-[#A05E03] text-xs font-medium px-2.5 py-1 rounded-full border border-orange-100"
                                            >
                                                {topic.name}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Modal footer */}
                        <div className="px-6 pb-6 flex gap-3">
                            <Button
                                onClick={() => { setShowModal(false); onFindTutor(); }}
                                className="flex-1 bg-[#FF9500] hover:bg-[#FF8000] text-black rounded-full font-medium"
                            >
                                {t('courseCard.findTutor')}
                            </Button>
                            <button
                                onClick={() => setShowModal(false)}
                                className="px-4 py-2 text-sm font-medium text-gray-500 hover:text-gray-700"
                            >
                                {t('common.cancel')}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
