import gsap from "gsap";
import { Draggable } from "gsap/Draggable";
import { InertiaPlugin } from "gsap/InertiaPlugin";
import data from "../content/concepts.json";

gsap.registerPlugin(Draggable, InertiaPlugin);

const SVG_NS = "http://www.w3.org/2000/svg";
const RADII = [130, 430, 790, 1190]; // hub, field ring, area ring, term ring
const HUES = [250, 160, 80, 300, 205, 25, 340, 120];
const LIGHT = [0.8, 0.75, 0.7];
const CHROMA = [0.13, 0.11, 0.09];
const KINDS = ["Field", "Area", "Term"];
const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

/* ---------- data → flat node list with angles ---------- */

const slug = (s) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

const nodes = [];
const byId = new Map();

function addNode(entry, depth, parent, hue) {
  const node = {
    ...entry,
    depth,
    parent,
    hue,
    children: [],
    id: (parent ? parent.id + "/" : "") + slug(entry.name),
  };
  if (parent) parent.children.push(node);
  nodes.push(node);
  byId.set(node.id, node);
  return node;
}

const termCount = data.fields.reduce(
  (n, f) => n + f.areas.reduce((m, a) => m + a.terms.length, 0),
  0
);
const step = 360 / termCount;
let cursor = 0;

data.fields.forEach((f, fi) => {
  const hue = HUES[fi % HUES.length];
  const field = addNode(f, 0, null, hue);
  field.alt = fi % 2;
  f.areas.forEach((a, ai) => {
    const area = addNode(a, 1, field, hue);
    area.alt = ai % 2;
    a.terms.forEach((t) => {
      const term = addNode(t, 2, area, hue);
      term.a0 = cursor * step;
      term.a1 = (cursor + 1) * step;
      term.alt = cursor % 2;
      cursor++;
    });
    area.a0 = area.children[0].a0;
    area.a1 = area.children.at(-1).a1;
  });
  field.a0 = field.children[0].a0;
  field.a1 = field.children.at(-1).a1;
});

nodes.forEach((n) => (n.mid = (n.a0 + n.a1) / 2));

/* ---------- SVG ---------- */

const pt = (r, deg) => {
  const a = (deg * Math.PI) / 180;
  return `${(r * Math.cos(a)).toFixed(2)} ${(r * Math.sin(a)).toFixed(2)}`;
};

function sectorPath(r0, r1, a0, a1) {
  const large = a1 - a0 > 180 ? 1 : 0;
  return (
    `M${pt(r1, a0)}A${r1} ${r1} 0 ${large} 1 ${pt(r1, a1)}` +
    `L${pt(r0, a1)}A${r0} ${r0} 0 ${large} 0 ${pt(r0, a0)}Z`
  );
}

const el = (name, attrs = {}) => {
  const node = document.createElementNS(SVG_NS, name);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  return node;
};

const rotor = document.getElementById("rotor");
const stage = document.getElementById("stage");
const reading = document.getElementById("reading");

const max = RADII[3] + 8;
const svg = el("svg", {
  viewBox: `${-max} ${-max} ${max * 2} ${max * 2}`,
  role: "group",
  tabindex: "0",
  "aria-label": "Concept wheel. Use arrow keys to move between concepts.",
});

for (const n of nodes) {
  const r0 = RADII[n.depth];
  const r1 = RADII[n.depth + 1];
  const g = el("g", { class: `seg d${n.depth}`, "data-id": n.id });
  const path = el("path", { d: sectorPath(r0, r1, n.a0, n.a1) });
  path.style.fill = `oklch(${LIGHT[n.depth] + (n.alt ? 0.035 : 0)} ${CHROMA[n.depth]} ${n.hue})`;
  const text = el("text", {
    transform: `rotate(${n.mid.toFixed(3)}) translate(${(r0 + r1) / 2} 0)`,
    "text-anchor": "middle",
    "dominant-baseline": "central",
  });
  text.textContent = n.name;
  const title = el("title");
  title.textContent = `${n.name} — ${KINDS[n.depth]}`;
  g.append(title, path, text);
  svg.append(g);
  n.el = g;
}

const outline = el("path", { class: "outline" });
const hub = el("circle", { class: "hub", r: RADII[0] - 6 });
const hubDot = el("circle", { class: "hub-dot", r: 16 });
svg.append(outline, hub, hubDot);
rotor.append(svg);

/* ---------- selection ---------- */

let current = null;

const lineage = (n) => (n ? [...lineage(n.parent), n] : []);
const descendants = (n) => n.children.flatMap((c) => [c, ...descendants(c)]);

function renderPanel(n, animate) {
  const crumbs = lineage(n.parent)
    .map((a) => `<button type="button" data-go="${a.id}">${a.name}</button><span>/</span>`)
    .join("");
  const list = (items) =>
    items
      .map((t, i) => `<li><span>${String(i + 1).padStart(2, "0")}</span>${t}</li>`)
      .join("");
  const inside = n.children.length
    ? `<section class="block"><h2>Inside ${n.name}</h2><div class="chips">${n.children
        .map((c) => `<button type="button" data-go="${c.id}">${c.name}</button>`)
        .join("")}</div></section>`
    : "";

  reading.innerHTML = `
    <p class="crumbs">${crumbs}<span class="kind">${KINDS[n.depth]}</span></p>
    <h1 class="title">${n.name}</h1>
    <p class="definition">${n.definition}</p>
    <section class="block"><h2>${data.listHeadings.showsUp}</h2><ol>${list(n.showsUp)}</ol></section>
    <section class="block"><h2>${data.listHeadings.tradeoffs}</h2><ol>${list(n.tradeoffs)}</ol></section>
    ${inside}`;
  reading.scrollTop = 0;

  if (animate && !reduceMotion) {
    gsap.from(reading.children, {
      y: 10,
      opacity: 0,
      duration: 0.35,
      stagger: 0.04,
      ease: "power2.out",
      clearProps: "all",
    });
  }
}

function rotateTo(n, instant) {
  wheelTween = null;
  gsap.killTweensOf(rotor);
  const target = -n.mid;
  if (instant || reduceMotion) {
    gsap.set(rotor, { rotation: target });
    drag.update();
    return;
  }
  gsap.to(rotor, {
    rotation: `${target}_short`,
    duration: 0.9,
    ease: "power3.out",
    onComplete: () => drag.update(),
  });
}

function select(n, { spin = true, instant = false, animate = true } = {}) {
  if (!n) return;
  current = n;
  const lit = new Set([...lineage(n), ...descendants(n)]);
  for (const m of nodes) m.el.classList.toggle("is-muted", !lit.has(m));
  outline.setAttribute("d", sectorPath(RADII[n.depth], RADII[n.depth + 1], n.a0, n.a1));
  document.documentElement.style.setProperty("--h", n.hue);
  renderPanel(n, animate);
  history.replaceState(null, "", "#" + n.id);
  document.title = `${n.name} · Stack Atlas`;
  if (spin) rotateTo(n, instant);
}

/* ---------- drag, scroll, click ---------- */

const [drag] = Draggable.create(rotor, {
  type: "rotation",
  inertia: !reduceMotion,
  throwResistance: 2600,
  onPress() {
    wheelTween = null;
    gsap.killTweensOf(rotor);
  },
  onClick(e) {
    const seg = e.target.closest?.(".seg");
    if (seg) select(byId.get(seg.dataset.id));
  },
});

let wheelTween = null;
let wheelTarget = 0;
stage.addEventListener(
  "wheel",
  (e) => {
    e.preventDefault();
    if (!wheelTween || !wheelTween.isActive()) {
      wheelTarget = gsap.getProperty(rotor, "rotation");
    }
    wheelTarget += (e.deltaY || e.deltaX) * 0.08;
    wheelTween = gsap.to(rotor, {
      rotation: wheelTarget,
      duration: reduceMotion ? 0 : 0.5,
      ease: "power2.out",
      overwrite: true,
      onComplete: () => drag.update(),
    });
  },
  { passive: false }
);

reading.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-go]");
  if (btn) select(byId.get(btn.dataset.go));
});

/* ---------- keyboard ---------- */

document.addEventListener("keydown", (e) => {
  if (e.metaKey || e.ctrlKey || e.altKey || !current) return;
  const ring = nodes.filter((n) => n.depth === current.depth);
  const i = ring.indexOf(current);
  let next = null;
  if (e.key === "ArrowRight") next = ring[(i + 1) % ring.length];
  else if (e.key === "ArrowLeft") next = ring[(i - 1 + ring.length) % ring.length];
  else if (e.key === "ArrowUp") next = current.parent;
  else if (e.key === "ArrowDown") next = current.children[0];
  else return;
  e.preventDefault();
  if (next) select(next);
});

addEventListener("hashchange", () => {
  const n = byId.get(location.hash.slice(1));
  if (n && n !== current) select(n);
});

/* ---------- start ---------- */

const first = byId.get(location.hash.slice(1)) ?? nodes[0];
select(first, { instant: true, animate: false });

if (!reduceMotion) {
  gsap.from(rotor, {
    rotation: "-=50",
    opacity: 0,
    duration: 1.4,
    ease: "power3.out",
    onComplete: () => drag.update(),
  });
}
