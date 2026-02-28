/**
 * useConfetti - Task completion celebration
 */

export function useConfetti() {
  const celebrate = async () => {
    if (import.meta.client) {
      const confetti = await import('canvas-confetti');
      confetti.default({
        particleCount: 100,
        spread: 70,
        origin: { y: 0.6 },
        colors: ['#C4A052', '#2D2A24', '#FFFFFF'],
      });
    }
  };

  return { celebrate };
}
