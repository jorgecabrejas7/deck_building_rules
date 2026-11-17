// A roll shows in the toast as a die that tumbles, flickering through faces, and lands on the real result with a small bounce.
// el is the empty .die; landed() runs once the result shows (table.js speaks it then). Callers skip this under reduced motion.
const TUMBLE = 600, FLICKER = 70;

export function tumble(el, roll, t, landed) {
  const coin = roll.sides === 2, words = [t.tbHeads, t.tbTails];
  const show = (i) => { el.textContent = i; };
  const rnd = () => (coin ? words[Math.floor(Math.random() * 2)] : 1 + Math.floor(Math.random() * roll.sides));
  show(rnd());
  const timer = setInterval(() => show(rnd()), FLICKER);
  const spin = el.animate({ transform: coin ? ['rotateX(0)', 'rotateX(1080deg)'] : ['rotate(0) translateY(0)', 'rotate(200deg) translateY(-10px)', 'rotate(540deg) translateY(0)'] }, { duration: TUMBLE, easing: 'cubic-bezier(.2,.7,.3,1)' });
  const land = () => {
    clearInterval(timer);
    show(coin ? words[roll.result % 2 ? 0 : 1] : roll.result); // heads on odd, as the log reads it
    el.animate({ transform: ['scale(1.3)', 'scale(1)'] }, { duration: 200, easing: 'cubic-bezier(.3,1.5,.5,1)' });
    landed();
  };
  spin.finished.then(land, land);
}
