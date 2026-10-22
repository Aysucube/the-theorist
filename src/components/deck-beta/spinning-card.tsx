/**
 * A card turning slowly on its own axis, seen from a little above with no
 * perspective (an axonometric view). Both sides show the card's face, so it
 * reads the same all the way round. Sized by its parent's width.
 */
export function SpinningCard({ imageUrl }: { imageUrl: string }) {
  const face = { backgroundImage: `url("${imageUrl}")` };
  return (
    <div aria-hidden className="spin-card">
      <div className="spin-face shadow-[0_2px_10px_rgb(0_0_0/0.55)]" style={face} />
      <div className="spin-face spin-back shadow-[0_2px_10px_rgb(0_0_0/0.55)]" style={face} />
    </div>
  );
}
