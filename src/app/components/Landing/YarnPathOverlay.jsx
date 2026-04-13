"use client";

import { useId } from "react";
import { PawPrint, Cat, Fish } from "lucide-react";
import styles from "./YarnPathOverlay.module.css";

const BRAND_ORANGE = "#d4a017";
const BRAND_ORANGE_SOFT = "#e8b84a";
const BRAND_BLUE = "#3b82f6";
const BRAND_BLUE_SOFT = "#60a5fa";

/**
 * "The Yarn Path" — Lucide: PawPrint, Cat, Fish (Lucide no trae espina de pez; Fish = pez minimal).
 * Overlay: pointer-events none + z-index sobre header para alinear el ovillo con el logo.
 */
export default function YarnPathOverlay({ isStudent }) {
  const uid = useId().replace(/:/g, "");
  const gradStudent = `yarn-student-${uid}`;
  const gradTutor = `yarn-tutor-${uid}`;

  /* Curva más ondulada (mayor variación en x); arranca arriba cerca del eje del logo */
  const yarnPath =
    "M 20 6 " +
    "C 32 95 8 185 26 275 " +
    "S 38 395 12 475 " +
    "C 4 555 34 635 18 715 " +
    "S 40 835 10 915 " +
    "C 6 1005 30 1085 16 1165 " +
    "S 36 1285 8 1365 " +
    "C 2 1455 28 1535 14 1615 " +
    "S 32 1710 6 1795 " +
    "C 10 1885 38 1965 20 2045 " +
    "S 4 2140 30 2220 " +
    "C 36 2300 8 2380 18 2460 " +
    "S 40 2555 12 2640 " +
    "C 6 2725 34 2805 16 2885 " +
    "S 28 2975 10 3065 " +
    "C 4 3155 24 3235 18 3315 " +
    "S 14 3385 22 3465 " +
    "C 30 3545 12 3625 20 3705";

  const strokeUrl = isStudent ? `url(#${gradStudent})` : `url(#${gradTutor})`;

  return (
    <div className={styles.overlay} aria-hidden="true" data-student={isStudent ? "true" : "false"}>
      {/* Ovillo junto a la columna del logo (header fijo); mismo eje X que el SVG del hilo */}
      <div className={styles.yarnOrigin}>
        <svg width="34" height="34" viewBox="0 0 36 36" xmlns="http://www.w3.org/2000/svg" className={styles.yarnBallSvg}>
          <circle cx="18" cy="18" r="11" fill="none" stroke="currentColor" strokeWidth="1.25" />
          <path
            d="M 10 14 Q 14 9 19 11 Q 24 13 22 18 Q 20 23 15 21 Q 10 19 10 14"
            fill="none"
            stroke="currentColor"
            strokeWidth="1"
            strokeLinecap="round"
          />
          <ellipse cx="18" cy="21" rx="6" ry="3" fill="none" stroke="currentColor" strokeWidth="0.9" opacity="0.65" />
        </svg>
      </div>

      <svg
        className={styles.svg}
        viewBox="0 0 100 3720"
        preserveAspectRatio="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <linearGradient id={gradStudent} x1="0" y1="0" x2="0" y2="1" gradientUnits="objectBoundingBox">
            <stop offset="0%" stopColor={BRAND_ORANGE_SOFT} />
            <stop offset="38%" stopColor={BRAND_ORANGE} />
            <stop offset="62%" stopColor="#c9a227" />
            <stop offset="82%" stopColor={BRAND_ORANGE} />
            <stop offset="100%" stopColor={BRAND_BLUE_SOFT} />
          </linearGradient>
          <linearGradient id={gradTutor} x1="0" y1="0" x2="0" y2="1" gradientUnits="objectBoundingBox">
            <stop offset="0%" stopColor={BRAND_ORANGE_SOFT} />
            <stop offset="22%" stopColor={BRAND_ORANGE} />
            <stop offset="48%" stopColor="#7c9ae8" />
            <stop offset="72%" stopColor={BRAND_BLUE} />
            <stop offset="100%" stopColor={BRAND_BLUE_SOFT} />
          </linearGradient>
        </defs>

        <path
          className={styles.yarnThread}
          d={yarnPath}
          fill="none"
          stroke={strokeUrl}
          strokeWidth="1.35"
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="nonScalingStroke"
        />

        <path
          className={styles.yarnThreadGhost}
          d={yarnPath}
          fill="none"
          stroke={strokeUrl}
          strokeWidth="1.35"
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="nonScalingStroke"
          opacity="0.35"
        />

        <path
          className={styles.yarnLoop}
          d="M 34 88 Q 46 102 30 118"
          fill="none"
          stroke={strokeUrl}
          strokeWidth="1.1"
          strokeLinecap="round"
          vectorEffect="nonScalingStroke"
        />
        <path
          className={styles.yarnLoop}
          d="M 6 1288 Q -4 1305 8 1325"
          fill="none"
          stroke={strokeUrl}
          strokeWidth="1.1"
          strokeLinecap="round"
          vectorEffect="nonScalingStroke"
        />
        <path
          className={styles.yarnLoop}
          d="M 38 2388 Q 48 2402 32 2420"
          fill="none"
          stroke={strokeUrl}
          strokeWidth="1.1"
          strokeLinecap="round"
          vectorEffect="nonScalingStroke"
        />
      </svg>

      <div className={`${styles.stickerSlot} ${styles.stickerPaw}`}>
        <PawPrint className={styles.lucideSticker} size={52} strokeWidth={1.35} aria-hidden />
      </div>
      <div className={`${styles.stickerSlot} ${styles.stickerCat}`}>
        <Cat className={styles.lucideSticker} size={58} strokeWidth={1.35} aria-hidden />
      </div>
      <div className={`${styles.stickerSlot} ${styles.stickerFish}`}>
        <Fish className={styles.lucideSticker} size={56} strokeWidth={1.35} aria-hidden />
      </div>
    </div>
  );
}
