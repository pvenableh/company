<!--
  DirectorChairIcon — an executive (high-back) office chair, drawn as a stroke
  OUTLINE in the lucide weight (24×24, stroke 2, round joins, no fill) so it sits
  in the app dock beside the other outline app icons instead of reading as a
  filled blob. Inherits `currentColor`, so it also works on the dark Director's
  Office / boardroom buttons. Sized by the consumer via a class (e.g. `w-4 h-4`).
-->
<template>
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="2"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <!-- high padded back + seat cushion -->
    <rect x="6.5" y="2.75" width="11" height="11.5" rx="2.5" />
    <!-- the line where the back meets the seat -->
    <path d="M6.5 10.25h11" />
    <!-- pedestal post -->
    <path d="M12 14.25v3.75" />
    <!-- five-star wheeled base -->
    <path d="M7 20.75 12 18l5 2.75" />
    <path d="M12 18v3.25" />
  </svg>
</template>
