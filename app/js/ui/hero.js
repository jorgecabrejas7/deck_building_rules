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
const smooth = (x) => x * x * (3 - 2 * x);

export function initHero() {
  const stage = $('hero'), ring = $('heroRing');
  const still = matchMedia('(prefers-reduced-motion:reduce)').matches;
  let built = false, cards = [], lights = [], glares = [], idle = 0, last = 0, frame = 0, front = -1, eased = 0, tiltX = 0, tiltY = 0, aimX = 0, aimY = 0;

  const build = () => {
    built = true;
    ring.innerHTML = WALKERS.map(([, file], i) => '<div class="hw-card" style="--i:' + i + ';--tint:' + WALKERS[i][0] + '"><div class="hw-back"></div>' +
      '<img src="https://cards.scryfall.io/normal/front/' + file + '" alt="" decoding="async" draggable="false"><div class="hw-glare"><i></i></div></div>').join('');
    cards = [...ring.children];
    glares = cards.map(c => c.querySelector('.hw-glare i'));
    // one prepainted light per colour: fading between them repaints nothing
    stage.querySelector('.hero-tint').innerHTML = WALKERS.map(([hue]) => '<i style="--tint:' + hue + '"></i>').join('');
    lights = [...stage.querySelectorAll('.hero-tint i')];
  };

  const draw = (now) => {
    frame = requestAnimationFrame(draw);
    const dt = Math.min(now - last, 50); last = now;
    const box = stage.getBoundingClientRect();
    const target = clamp01(-box.top / Math.max(box.height - innerHeight, 1));
    // the cards follow the scroll with a little weight, so a wheel's steps turn into one motion
    eased += (target - eased) * (1 - Math.exp(-dt / 140));
    tiltX += (aimX - tiltX) * (1 - Math.exp(-dt / 200));
    tiltY += (aimY - tiltY) * (1 - Math.exp(-dt / 200));
    const p = eased, calm = 1 - smooth(clamp01((p - 0.35) / 0.2));
    idle += dt * 0.007 * calm;
    const spin = idle + p * 200;
    const R = Math.min(innerWidth * 0.36, innerHeight * 0.34), step = 360 / cards.length;
    let nearest = 0, best = -2;
    const gather = smooth(clamp01((p - 0.42) / 0.45));
    const rx = -7 * (1 - gather) + tiltX;
    cards.forEach((card, i) => {
      const a = spin + i * step, rad = a * Math.PI / 180;
      // each card leaves the ring in turn and lands flat on the pile, one above the last
      const land = smooth(clamp01((p - 0.42 - i * 0.03) / 0.22));
      const facing = ((a % 360) + 540) % 360 - 180;
      const x = Math.sin(rad) * R * (1 - land), z = Math.cos(rad) * R * (1 - land);
      // every card has its own perspective and a painted order, so two can never cut through each other
      card.style.transform = 'perspective(1500px) translateY(' + (gather * 6).toFixed(2) + 'vh) rotateX(' + rx.toFixed(2) + 'deg) rotateZ(' + tiltY.toFixed(2) + 'deg) translate3d(' + x.toFixed(1) + 'px,' + (-land * i * 2).toFixed(1) + 'px,' + z.toFixed(1) + 'px) rotateY(' + (facing * (1 - land)).toFixed(1) + 'deg)';
      card.style.zIndex = land > 0.5 ? 3000 + i : Math.round(z) + 1500;
      if (Math.cos(rad) > best) { best = Math.cos(rad); nearest = i; }
      glares[i].style.transform = 'translate3d(' + (facing * 0.6).toFixed(1) + '%,0,0)';
    });
    if (nearest !== front) {
      if (front >= 0) lights[front].classList.remove('on');
      front = nearest; lights[front].classList.add('on');
    }
    stage.style.setProperty('--copy', (1 - smooth(clamp01(p / 0.3))).toFixed(3));
    stage.style.setProperty('--leave', smooth(clamp01((p - 0.9) / 0.1)).toFixed(3));
  };

  new IntersectionObserver(([e]) => {
    if (!built && e.isIntersecting) build();
    if (still) return;
    cancelAnimationFrame(frame);
    if (e.isIntersecting) { last = performance.now(); frame = requestAnimationFrame(draw); }
  }).observe(stage);

  if (matchMedia('(hover:hover)').matches && !still)
    stage.addEventListener('pointermove', (e) => { aimX = (0.5 - e.clientY / innerHeight) * 5; aimY = (e.clientX / innerWidth - 0.5) * 2.5; });

  $('heroCta').onclick = () => {
    $('deckText').scrollIntoView({ behavior: still ? 'auto' : 'smooth', block: 'center' });
    $('deckText').focus({ preventScroll: true });
  };
}
