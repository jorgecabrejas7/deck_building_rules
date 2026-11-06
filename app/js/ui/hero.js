import { $ } from './helpers.js';

// The landing's one authored moment: the planeswalkers circle, and scrolling shuffles them
// into a single deck right above the box where you paste yours. All of it runs on one
// animation frame, and only while the stage is on screen.
// [hue of the card's colour, its image on Scryfall]
const WALKERS = [
  ['240', 'c/8/c8817585-0d32-4d56-9142-0d29512e86a9.jpg'], // Jace, the Mind Sculptor
  ['310', 'e/f/efbb7256-9337-4183-8bda-a419f3f2c501.jpg'], // Liliana of the Veil
  ['30', '4/0/40cb22c8-cb03-45c9-bb0e-b8cabdcc43cd.jpg'], // Chandra, Torch of Defiance
  ['150', 'f/8/f857bbe4-5619-4733-a0c7-69700f2ef4f3.jpg'], // Nissa, Who Shakes the World
  ['85', '1/8/187e887c-c39d-4d25-a506-cdc95fc70316.jpg'], // Gideon, Ally of Zendikar
  ['200', '5/d/5d10b752-d9cb-419d-a5c4-d4ee1acb655e.jpg'], // Teferi, Hero of Dominaria
  ['60', '4/b/4b0c6662-4dde-40a2-97e0-0318478c0367.jpg'], // Karn Liberated
  ['340', 'd/a/da1a9643-34d6-4b4b-b896-2d4626eca40a.jpg'], // Sorin, Solemn Visitor
];
const clamp01 = (x) => Math.min(1, Math.max(0, x));
const easeOut = (x) => 1 - (1 - x) ** 3;

export function initHero() {
  const stage = $('hero'), ring = $('heroRing');
  const still = matchMedia('(prefers-reduced-motion:reduce)').matches;
  let built = false, cards = [], idle = 0, last = 0, frame = 0, front = -1, tiltX = 0, tiltY = 0;

  const build = () => {
    built = true;
    ring.innerHTML = WALKERS.map(([, file], i) => '<div class="hw-card" style="--i:' + i + '"><div class="hw-back"></div>' +
      '<img src="https://cards.scryfall.io/normal/front/' + file + '" alt="" decoding="async" draggable="false"><div class="hw-glare"></div></div>').join('');
    cards = [...ring.children];
  };

  const draw = (now) => {
    frame = requestAnimationFrame(draw);
    const box = stage.getBoundingClientRect();
    const p = clamp01(-box.top / Math.max(box.height - innerHeight, 1));
    idle += Math.min(now - last, 50) * 0.008; last = now;
    const spin = idle + p * 540;
    const gather = easeOut(clamp01((p - 0.5) / 0.4));
    const radius = Math.min(innerWidth * 0.36, innerHeight * 0.34) * (1 - gather);
    const step = 360 / cards.length;
    let nearest = 0, best = -2;
    cards.forEach((card, i) => {
      const a = (spin + i * step) * (1 - gather);
      // cards end up a single square-ish deck, each a hair above the last
      card.style.transform = 'rotateY(' + a + 'deg) translateZ(' + radius + 'px) translateY(' + (-i * 2 * gather) + 'px)';
      const facing = Math.cos(a * Math.PI / 180);
      if (facing > best) { best = facing; nearest = i; }
      card.style.setProperty('--sheen', ((a % 360) / 3.6).toFixed(1) + '%');
    });
    if (nearest !== front) { front = nearest; stage.style.setProperty('--tint', WALKERS[nearest][0]); }
    const leave = clamp01((p - 0.86) / 0.14);
    ring.style.transform = 'translateY(' + (gather * 8) + 'vh) scale(' + (1 - gather * 0.25) + ') rotateX(' + (-7 + tiltX) + 'deg) rotateZ(' + tiltY + 'deg)';
    stage.style.setProperty('--copy', (1 - clamp01(p / 0.4)).toFixed(3));
    stage.style.setProperty('--leave', leave.toFixed(3));
  };

  new IntersectionObserver(([e]) => {
    if (!built && e.isIntersecting) build();
    if (still) return;
    cancelAnimationFrame(frame);
    if (e.isIntersecting) { last = performance.now(); frame = requestAnimationFrame(draw); }
  }).observe(stage);

  if (matchMedia('(hover:hover)').matches && !still)
    stage.addEventListener('pointermove', (e) => { tiltX = (0.5 - e.clientY / innerHeight) * 6; tiltY = (e.clientX / innerWidth - 0.5) * 3; });

  $('heroCta').onclick = () => {
    $('deckText').scrollIntoView({ behavior: still ? 'auto' : 'smooth', block: 'center' });
    $('deckText').focus({ preventScroll: true });
  };
}
