"use strict";

const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/* ------------------------------------------------------------------
 * Rotating role line: types, pauses, deletes, next.
 * ------------------------------------------------------------------ */
(function roles() {
    const el = document.getElementById("role");
    if (!el) return;

    const phrases = [
        "software engineer",
        "energy markets",
        "energy grids",
        "data science",
    ];

    if (reducedMotion) {
        el.textContent = phrases.join(" · ");
        return;
    }

    let i = 0;
    let n = 0;
    let deleting = false;

    function tick() {
        const word = phrases[i];
        n += deleting ? -1 : 1;
        el.textContent = word.slice(0, n);

        let delay = deleting ? 35 : 70 + Math.random() * 60;
        if (!deleting && n === word.length) {
            deleting = true;
            delay = 1800;
        } else if (deleting && n === 0) {
            deleting = false;
            i = (i + 1) % phrases.length;
            delay = 350;
        }
        setTimeout(tick, delay);
    }

    // start once the name has finished typing
    setTimeout(tick, 2700);
})();

/* ------------------------------------------------------------------
 * Cards: glow follows the cursor.
 * ------------------------------------------------------------------ */
document.querySelectorAll(".card").forEach((card) => {
    card.addEventListener("pointermove", (e) => {
        const r = card.getBoundingClientRect();
        card.style.setProperty("--x", `${e.clientX - r.left}px`);
        card.style.setProperty("--y", `${e.clientY - r.top}px`);
    });
});

/* ------------------------------------------------------------------
 * Background: a power grid. Nodes are substations, edges are lines,
 * and pulses of energy flow through the network. Hover lights up
 * nearby nodes; clicking injects a burst of power.
 * ------------------------------------------------------------------ */
(function grid() {
    const canvas = document.getElementById("grid");
    if (!canvas) return;
    const ctx = canvas.getContext("2d");

    const COLORS = ["#E5C07B", "#61AFEF", "#98C379", "#56B6C2"];
    const SPACING = 110;
    const TRAIL = 16;

    let w, h, dpr;
    let nodes = [];
    let edges = [];
    let pulses = [];
    const mouse = { x: -9999, y: -9999 };

    function build() {
        dpr = Math.min(window.devicePixelRatio || 1, 2);
        w = window.innerWidth;
        h = window.innerHeight;
        canvas.width = w * dpr;
        canvas.height = h * dpr;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

        const cols = Math.ceil(w / SPACING) + 2;
        const rows = Math.ceil(h / SPACING) + 2;
        const offX = (w - (cols - 1) * SPACING) / 2;
        const offY = (h - (rows - 1) * SPACING) / 2;
        const jitter = SPACING * 0.28;

        nodes = [];
        edges = [];
        pulses = [];

        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                nodes.push({
                    x: offX + c * SPACING + (Math.random() - 0.5) * 2 * jitter,
                    y: offY + r * SPACING + (Math.random() - 0.5) * 2 * jitter,
                    adj: [],
                    glow: 0,
                    // a few larger "substations"
                    hub: Math.random() < 0.08,
                });
            }
        }

        const link = (a, b) => {
            const A = nodes[a], B = nodes[b];
            edges.push({ a, b, len: Math.hypot(A.x - B.x, A.y - B.y) });
            A.adj.push(b);
            B.adj.push(a);
        };

        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                const i = r * cols + c;
                if (c < cols - 1 && Math.random() < 0.72) link(i, i + 1);
                if (r < rows - 1 && Math.random() < 0.72) link(i, i + cols);
                if (c < cols - 1 && r < rows - 1 && Math.random() < 0.12) link(i, i + cols + 1);
            }
        }
    }

    function spawn(from, color) {
        const node = nodes[from];
        if (!node || node.adj.length === 0) return;
        const to = node.adj[(Math.random() * node.adj.length) | 0];
        pulses.push({
            from,
            to,
            t: 0,
            speed: 0.9 + Math.random() * 1.1, // px per ms * 0.1
            hops: 3 + ((Math.random() * 6) | 0),
            color: color || COLORS[(Math.random() * COLORS.length) | 0],
            trail: [],
        });
    }

    function nearestNode(x, y) {
        let best = -1, bestD = Infinity;
        for (let i = 0; i < nodes.length; i++) {
            const d = (nodes[i].x - x) ** 2 + (nodes[i].y - y) ** 2;
            if (d < bestD) { bestD = d; best = i; }
        }
        return best;
    }

    function step(dt) {
        // keep the network lively
        const target = Math.max(6, Math.round((w * h) / 45000));
        if (pulses.length < target && Math.random() < 0.08) {
            spawn((Math.random() * nodes.length) | 0);
        }

        for (let k = pulses.length - 1; k >= 0; k--) {
            const p = pulses[k];
            const A = nodes[p.from], B = nodes[p.to];
            const len = Math.hypot(A.x - B.x, A.y - B.y) || 1;
            p.t += (p.speed * dt * 0.1) / len;

            if (p.t >= 1) {
                B.glow = 1;
                p.hops--;
                // route onward, avoiding going straight back
                const options = B.adj.filter((n) => n !== p.from);
                if (p.hops <= 0 || options.length === 0) {
                    p.dead = true;
                } else {
                    p.from = p.to;
                    p.to = options[(Math.random() * options.length) | 0];
                    p.t = 0;
                }
            }

            const S = nodes[p.from], E = nodes[p.to];
            const t = Math.min(p.t, 1);
            if (!p.dead) {
                p.trail.push({ x: S.x + (E.x - S.x) * t, y: S.y + (E.y - S.y) * t });
            }
            if (p.trail.length > TRAIL || (p.dead && p.trail.length)) p.trail.shift();
            if (p.dead && p.trail.length === 0) pulses.splice(k, 1);
        }

        for (const n of nodes) n.glow *= 0.94;
    }

    function draw() {
        ctx.clearRect(0, 0, w, h);

        // lines
        ctx.lineWidth = 1;
        for (const e of edges) {
            const A = nodes[e.a], B = nodes[e.b];
            const mx = (A.x + B.x) / 2, my = (A.y + B.y) / 2;
            const near = Math.max(0, 1 - Math.hypot(mx - mouse.x, my - mouse.y) / 220);
            ctx.strokeStyle = `rgba(97, 175, 239, ${0.06 + near * 0.35})`;
            ctx.beginPath();
            ctx.moveTo(A.x, A.y);
            ctx.lineTo(B.x, B.y);
            ctx.stroke();
        }

        // nodes
        for (const n of nodes) {
            if (n.adj.length === 0) continue;
            const near = Math.max(0, 1 - Math.hypot(n.x - mouse.x, n.y - mouse.y) / 200);
            const g = Math.max(n.glow, near);
            const r = (n.hub ? 2.6 : 1.5) + g * 2.2;
            ctx.fillStyle = `rgba(171, 178, 191, ${0.18 + g * 0.6})`;
            ctx.beginPath();
            ctx.arc(n.x, n.y, r, 0, Math.PI * 2);
            ctx.fill();
            if (n.hub) {
                ctx.strokeStyle = `rgba(229, 192, 123, ${0.25 + g * 0.5})`;
                ctx.beginPath();
                ctx.arc(n.x, n.y, r + 3.5, 0, Math.PI * 2);
                ctx.stroke();
            }
        }

        // energy pulses
        ctx.globalCompositeOperation = "lighter";
        for (const p of pulses) {
            const tr = p.trail;
            for (let i = 1; i < tr.length; i++) {
                const a = i / tr.length;
                ctx.strokeStyle = hexA(p.color, a * 0.7);
                ctx.lineWidth = 2 * a;
                ctx.beginPath();
                ctx.moveTo(tr[i - 1].x, tr[i - 1].y);
                ctx.lineTo(tr[i].x, tr[i].y);
                ctx.stroke();
            }
            const head = tr[tr.length - 1];
            if (head && !p.dead) {
                const grd = ctx.createRadialGradient(head.x, head.y, 0, head.x, head.y, 10);
                grd.addColorStop(0, hexA(p.color, 0.9));
                grd.addColorStop(1, hexA(p.color, 0));
                ctx.fillStyle = grd;
                ctx.beginPath();
                ctx.arc(head.x, head.y, 10, 0, Math.PI * 2);
                ctx.fill();
            }
        }
        ctx.globalCompositeOperation = "source-over";
    }

    const hexCache = {};
    function hexA(hex, a) {
        let rgb = hexCache[hex];
        if (!rgb) {
            const v = parseInt(hex.slice(1), 16);
            rgb = hexCache[hex] = `${(v >> 16) & 255}, ${(v >> 8) & 255}, ${v & 255}`;
        }
        return `rgba(${rgb}, ${a.toFixed(3)})`;
    }

    let last = performance.now();
    function frame(now) {
        const dt = Math.min(now - last, 50);
        last = now;
        step(dt);
        draw();
        requestAnimationFrame(frame);
    }

    build();
    let resizeTimer;
    window.addEventListener("resize", () => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => { build(); if (reducedMotion) draw(); }, 150);
    });

    if (reducedMotion) {
        draw();
        return;
    }

    window.addEventListener("pointermove", (e) => {
        mouse.x = e.clientX;
        mouse.y = e.clientY;
    });
    document.addEventListener("pointerleave", () => {
        mouse.x = mouse.y = -9999;
    });
    window.addEventListener("pointerdown", (e) => {
        if (e.target.closest("a")) return;
        const i = nearestNode(e.clientX, e.clientY);
        if (i < 0) return;
        nodes[i].glow = 1;
        for (let k = 0; k < 8; k++) spawn(i, "#E5C07B");
    });

    requestAnimationFrame(frame);
})();
