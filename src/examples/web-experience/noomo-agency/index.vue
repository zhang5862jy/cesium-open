<script setup lang="ts">
import { nextTick, onMounted, onUnmounted, ref } from "vue";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import {
  NoomoThreeScene,
  type NoomoSceneStatus,
} from "./NoomoThreeScene";

gsap.registerPlugin(ScrollTrigger);

const pageRoot = ref<HTMLElement | null>(null);
const webglCanvas = ref<HTMLCanvasElement | null>(null);
const menuOpen = ref(false);
const isFullscreen = ref(false);
const sceneStatus = ref<NoomoSceneStatus>("loading");

let introContext: gsap.Context | undefined;
let mediaContext: gsap.MatchMedia | undefined;
let removePointerMotion: (() => void) | undefined;
let threeScene: NoomoThreeScene | undefined;

const workItems = [
  {
    index: "01",
    client: "VOGUE BUSINESS",
    title: "GEN Z BROKE THE MARKETING FUNNEL",
    type: "STORYTELLING WEBSITE",
    tone: "violet",
  },
  {
    index: "02",
    client: "SALESFORCE",
    title: "AI THAT MOVES BUSINESS FORWARD",
    type: "IMMERSIVE WEB EXPERIENCE",
    tone: "blue",
  },
  {
    index: "03",
    client: "RED BULL",
    title: "BUILT FOR THE NEXT IMPOSSIBLE",
    type: "BRAND ACTIVATION",
    tone: "coral",
  },
];

const testimonials = [
  {
    quote:
      "Noomo does such incredible and thoughtful work. I have been at this almost 25 years and have never been more impressed with an agency.",
    name: "WALLIS MILLS",
    role: "DIRECTOR OF MARKETING / AMD",
  },
  {
    quote:
      "They quickly immerse themselves in complicated products, then turn that complexity into an experience people genuinely want to explore.",
    name: "JONNY FRUITS",
    role: "SR. CREATIVE DIRECTOR / SALESFORCE",
  },
  {
    quote:
      "Their dedication to listening, iterating, and pushing for the best possible experience makes them invaluable collaborators.",
    name: "DAVID GRAU",
    role: "GLOBAL PRODUCT DESIGN DIRECTOR",
  },
];

const awards = [
  ["VIBRANT WELLNESS", "FWA OF THE DAY", "2026"],
  ["NOOMO VALENTIME", "FWA OF THE DAY", "2025"],
  ["NOOMO BEAT", "SITE OF THE DAY", "2024"],
  ["NOOMO LABS", "TECHNICAL ACHIEVEMENT", "2024"],
  ["NOOMO AGENCY", "WEBSITE OF THE YEAR", "2024"],
];

function goToSection(selector: string) {
  const root = pageRoot.value;
  const target = root?.querySelector<HTMLElement>(selector);
  if (!root || !target) return;
  root.scrollTo({ top: target.offsetTop, behavior: "smooth" });
  menuOpen.value = false;
}

async function toggleFullscreen() {
  const root = pageRoot.value;
  if (!root) return;

  try {
    if (!document.fullscreenElement) {
      await root.requestFullscreen();
    } else {
      await document.exitFullscreen();
    }
  } finally {
    await nextTick();
    ScrollTrigger.refresh();
  }
}

function handleFullscreenChange() {
  isFullscreen.value = document.fullscreenElement === pageRoot.value;
  requestAnimationFrame(() => {
    threeScene?.resize();
    ScrollTrigger.refresh();
  });
}

onMounted(() => {
  const root = pageRoot.value;
  const canvas = webglCanvas.value;
  if (!root || !canvas) return;

  threeScene = new NoomoThreeScene(canvas, root, (status) => {
    sceneStatus.value = status;
  });
  void threeScene.init().then(() => {
    ScrollTrigger.refresh();
  });

  const reduceMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)",
  ).matches;

  introContext = gsap.context(() => {
    if (reduceMotion) {
      gsap.set(".load-cover", { display: "none" });
      gsap.set(".hero-line-inner, .intro-reveal, .site-header", {
        autoAlpha: 1,
        y: 0,
      });
      return;
    }

    const intro = gsap.timeline({
      defaults: { ease: "power3.inOut" },
    });

    intro
      .from(".load-letter", {
        yPercent: 110,
        stagger: 0.055,
        duration: 0.75,
      })
      .to(".load-word", {
        scale: 0.86,
        duration: 0.45,
        ease: "power2.in",
      })
      .to(".load-cover", {
        yPercent: -100,
        duration: 0.9,
      })
      .from(
        ".hero-line-inner",
        {
          yPercent: 115,
          duration: 1.05,
          stagger: 0.1,
        },
        "-=0.35",
      )
      .from(
        ".intro-reveal",
        {
          y: 22,
          autoAlpha: 0,
          duration: 0.7,
          stagger: 0.08,
        },
        "-=0.55",
      )
      .from(
        ".site-header",
        {
          y: -18,
          autoAlpha: 0,
          duration: 0.6,
        },
        "-=0.65",
      );
  }, root);

  mediaContext = gsap.matchMedia();
  mediaContext.add(
    {
      desktop: "(min-width: 821px)",
      mobile: "(max-width: 820px)",
      reduce: "(prefers-reduced-motion: reduce)",
    },
    (context) => {
      const { desktop, reduce } = context.conditions as {
        desktop: boolean;
        mobile: boolean;
        reduce: boolean;
      };
      const animationDuration = reduce ? 0 : 1;

      gsap.to(threeScene!.state, {
        heroProgress: 1,
        ease: "none",
        scrollTrigger: {
          trigger: ".hero",
          scroller: root,
          start: "top top",
          end: "bottom top",
          scrub: reduce ? false : 0.7,
        },
      });

      const immersive = gsap.timeline({
        scrollTrigger: {
          trigger: ".immersive-section",
          scroller: root,
          start: "top top",
          end: desktop ? "+=180%" : "+=120%",
          scrub: reduce ? false : 0.9,
          pin: ".immersive-pin",
          anticipatePin: 1,
        },
      });

      immersive
        .fromTo(
          ".immersive-title",
          { xPercent: desktop ? -18 : -5 },
          { xPercent: desktop ? 18 : 5, ease: "none" },
        )
        .to(
          threeScene!.state,
          {
            immersiveProgress: 1,
            duration: 1,
            ease: "none",
          },
          0,
        )
        .fromTo(
          ".immersive-copy",
          { autoAlpha: 0, y: 38 },
          {
            autoAlpha: 1,
            y: 0,
            duration: animationDuration,
          },
          0.42,
        );

      gsap.to(threeScene!.state, {
        exitProgress: 1,
        ease: "none",
        scrollTrigger: {
          trigger: ".story-section",
          scroller: root,
          start: "top bottom",
          end: "top 45%",
          scrub: reduce ? false : 0.65,
        },
      });

      gsap.from(".manifesto-line", {
        xPercent: (index) => (index % 2 ? 16 : -16),
        autoAlpha: reduce ? 1 : 0,
        stagger: 0.08,
        duration: animationDuration,
        ease: "power3.out",
        scrollTrigger: {
          trigger: ".manifesto",
          scroller: root,
          start: "top 72%",
          toggleActions: "play none none reverse",
        },
      });

      ScrollTrigger.batch(".reveal-block", {
        scroller: root,
        start: "top 86%",
        once: true,
        onEnter: (batch) =>
          gsap.fromTo(
            batch,
            { y: reduce ? 0 : 52, autoAlpha: reduce ? 1 : 0 },
            {
              y: 0,
              autoAlpha: 1,
              duration: animationDuration,
              stagger: 0.1,
              ease: "power3.out",
              overwrite: true,
            },
          ),
      });

      if (desktop && !reduce) {
        const cards = gsap.utils.toArray<HTMLElement>(".project-card");
        cards.forEach((card) => {
          const visual = card.querySelector(".project-visual");
          gsap.fromTo(
            visual,
            { scale: 1.12 },
            {
              scale: 1,
              ease: "none",
              scrollTrigger: {
                trigger: card,
                scroller: root,
                start: "top bottom",
                end: "bottom top",
                scrub: 0.8,
              },
            },
          );
        });
      }

      return () => {
        immersive.kill();
      };
    },
    root,
  );

  if (!reduceMotion) {
    const onPointerMove = (event: PointerEvent) => {
      const bounds = root.getBoundingClientRect();
      const x = ((event.clientX - bounds.left) / bounds.width - 0.5) * 2;
      const y = ((event.clientY - bounds.top) / bounds.height - 0.5) * 2;
      threeScene?.setPointer(x, y);
    };
    root.addEventListener("pointermove", onPointerMove);
    removePointerMotion = () =>
      root.removeEventListener("pointermove", onPointerMove);
  }

  document.addEventListener("fullscreenchange", handleFullscreenChange);
  document.fonts.ready.then(() => ScrollTrigger.refresh());
});

onUnmounted(() => {
  document.removeEventListener("fullscreenchange", handleFullscreenChange);
  removePointerMotion?.();
  mediaContext?.revert();
  introContext?.revert();
  threeScene?.destroy();
  threeScene = undefined;
});
</script>

<template>
  <div ref="pageRoot" class="noomo-page">
    <div class="load-cover" aria-hidden="true">
      <div class="load-word">
        <span
          v-for="(letter, index) in 'noomo'"
          :key="`${letter}-${index}`"
          class="load-letter"
        >
          {{ letter }}
        </span>
      </div>
    </div>

    <header class="site-header">
      <button class="logo" aria-label="回到顶部" @click="goToSection('.hero')">
        noo<span>m</span>o
      </button>

      <nav aria-label="主导航">
        <button @click="goToSection('.work-section')">WORK</button>
        <button @click="goToSection('.story-section')">OUR STORY</button>
        <button @click="goToSection('.services-section')">LABS</button>
        <button @click="goToSection('.awards-section')">INSIGHTS</button>
        <button @click="goToSection('.contact-section')">CONNECT</button>
      </nav>

      <button
        class="menu-button"
        :aria-expanded="menuOpen"
        aria-controls="mobile-menu"
        @click="menuOpen = !menuOpen"
      >
        {{ menuOpen ? "CLOSE" : "MENU" }}
      </button>
    </header>

    <div
      id="mobile-menu"
      class="mobile-menu"
      :class="{ open: menuOpen }"
      :aria-hidden="!menuOpen"
    >
      <button @click="goToSection('.work-section')">Work</button>
      <button @click="goToSection('.story-section')">Our story</button>
      <button @click="goToSection('.services-section')">Labs</button>
      <button @click="goToSection('.awards-section')">Insights</button>
      <button @click="goToSection('.contact-section')">Connect</button>
    </div>

    <button
      class="fullscreen-button"
      type="button"
      :title="isFullscreen ? '退出全屏' : '进入全屏'"
      :aria-label="isFullscreen ? '退出全屏' : '进入全屏'"
      @click="toggleFullscreen"
    >
      <svg
        v-if="!isFullscreen"
        viewBox="0 0 24 24"
        aria-hidden="true"
      >
        <path d="M8 3H3v5M16 3h5v5M8 21H3v-5M16 21h5v-5" />
      </svg>
      <svg v-else viewBox="0 0 24 24" aria-hidden="true">
        <path d="M3 8h5V3M21 8h-5V3M3 16h5v5M21 16h-5v5" />
      </svg>
      <span>{{ isFullscreen ? "EXIT" : "FULL" }}</span>
    </button>

    <main>
      <div
        class="webgl-layer"
        :class="`webgl-${sceneStatus}`"
        aria-label="Three.js GLB 模型展示"
      >
        <canvas ref="webglCanvas" class="webgl-canvas"></canvas>
        <div v-if="sceneStatus === 'loading'" class="webgl-status">
          LOADING GLB / THREE.JS
        </div>
        <div v-else-if="sceneStatus === 'error'" class="webgl-status webgl-error">
          WEBGL MODEL LOAD ERROR
        </div>
      </div>

      <section class="hero">
        <div class="ambient ambient-one"></div>
        <div class="ambient ambient-two"></div>

        <div class="hero-type" aria-label="Design that elevates your digital presence">
          <div class="hero-line">
            <span class="hero-line-inner">DESIGN THAT</span>
          </div>
          <div class="hero-line hero-line-two">
            <span class="hero-line-inner">ELEVATES <i>YOUR</i></span>
          </div>
          <div class="hero-line">
            <span class="hero-line-inner">DIGITAL PRESENCE</span>
          </div>
        </div>

        <p class="hero-intro intro-reveal">
          Award-winning design agency<br />
          building websites, activations,<br />
          and experiences that make<br />
          people stop scrolling.
        </p>

        <button class="scroll-cue intro-reveal" @click="goToSection('.immersive-section')">
          <span>SCROLL</span>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="m7 9 5 5 5-5" />
          </svg>
        </button>
      </section>

      <section class="immersive-section">
        <div class="immersive-pin">
          <div class="ambient ambient-three"></div>
          <div class="immersive-title">IMMERSIVE</div>
          <div class="immersive-copy">
            <span>01 / DIGITAL STORYTELLING</span>
            <p>
              Where craft and narrative become one. We let the story dictate
              the medium.
            </p>
          </div>
        </div>
      </section>

      <section class="story-section">
        <div class="section-label reveal-block">
          <span>OUR APPROACH</span>
          <span>( 02 )</span>
        </div>

        <div class="manifesto">
          <div class="manifesto-line">EXPERIENCES WHERE CRAFT</div>
          <div class="manifesto-line">AND NARRATIVE BECOME</div>
          <div class="manifesto-line">ONE.</div>
        </div>

        <div class="story-copy reveal-block">
          <p>
            From immersive 3D websites to cinematic brand films, we build
            digital experiences around a sharp idea—then obsess over every
            detail that brings it to life.
          </p>
          <p>
            We partner with brands that value innovation, trust the process,
            and believe exceptional work is made through true collaboration.
          </p>
        </div>
      </section>

      <section class="services-section">
        <div class="service-column reveal-block">
          <span class="pill">Services</span>
          <ul>
            <li>3D websites</li>
            <li>Storytelling websites</li>
            <li>3D storytelling videos</li>
            <li>Immersive web experiences</li>
            <li>WebGL development</li>
            <li>Brand activation microsites</li>
            <li>Digital event experiences</li>
            <li>AI-driven experiences</li>
          </ul>
        </div>
        <div class="service-column reveal-block">
          <span class="pill face">♥‿♥</span>
          <ul>
            <li>Vogue Business</li>
            <li>Samsung</li>
            <li>Cadence Design Systems</li>
            <li>Space Needle</li>
            <li>OneLine Health</li>
            <li>Middle Finance</li>
            <li>The Art of Living</li>
            <li>Life House</li>
          </ul>
        </div>
        <div class="client-strip" aria-label="客户">
          <div>
            SALESFORCE · AMD · COINBASE · RED BULL · INTEL · SALESFORCE · AMD ·
            COINBASE · RED BULL · INTEL ·
          </div>
        </div>
      </section>

      <section class="work-section">
        <div class="section-label reveal-block">
          <span>SELECTED WORK</span>
          <span>( 03—05 )</span>
        </div>

        <article
          v-for="item in workItems"
          :key="item.index"
          class="project-card reveal-block"
          :class="`project-${item.tone}`"
        >
          <div class="project-visual">
            <div class="project-orbit"></div>
            <div class="project-sphere"></div>
            <div class="project-grid"></div>
            <span class="project-client">{{ item.client }}</span>
          </div>
          <div class="project-meta">
            <span>{{ item.index }}</span>
            <h3>{{ item.title }}</h3>
            <p>{{ item.type }}</p>
            <span class="round-arrow">↗</span>
          </div>
        </article>
      </section>

      <section class="team-section">
        <div class="section-label reveal-block">
          <span>THE HUMAN PART</span>
          <span>( ALWAYS )</span>
        </div>
        <h2 class="reveal-block">
          GREAT WORK CAN’T<br />
          HAPPEN WITHOUT<br />
          TEAM A.
        </h2>
        <div class="team-copy reveal-block">
          <p>
            When working with us, you get the value of working with founders.
            Building strong relationships is at the heart of our approach.
          </p>
          <p>
            We take the time to understand your unique needs and create
            tailored design solutions that make an impact.
          </p>
        </div>
      </section>

      <section class="testimonial-section">
        <article
          v-for="(testimonial, index) in testimonials"
          :key="testimonial.name"
          class="quote-card reveal-block"
        >
          <div class="quote-number">0{{ index + 1 }}</div>
          <blockquote>“{{ testimonial.quote }}”</blockquote>
          <div class="quote-person">
            <strong>{{ testimonial.name }}</strong>
            <span>{{ testimonial.role }}</span>
          </div>
        </article>
      </section>

      <section class="awards-section">
        <div class="awards-heading reveal-block">
          <span>RECOGNITION</span>
          <h2>
            INNOVATIVE WORK<br />
            THAT PUSHES WHAT’S<br />
            POSSIBLE.
          </h2>
        </div>
        <div class="award-table reveal-block">
          <div class="award-row award-head">
            <span>PROJECT</span><span>RECOGNITION</span><span>YEAR</span>
          </div>
          <div v-for="award in awards" :key="award[0]" class="award-row">
            <span>{{ award[0] }}</span>
            <span>{{ award[1] }}</span>
            <span>{{ award[2] }}</span>
          </div>
        </div>
      </section>

      <section class="contact-section">
        <p class="contact-kicker reveal-block">
          BUT WE’RE HERE NOT TO TALK ABOUT OURSELVES — WE’RE HERE TO TALK
          ABOUT YOU, YOUR COMPANY, YOUR PRODUCT, AND YOUR GOALS.
        </p>
        <div class="contact-title reveal-block">
          <span>WITH US</span>
          <span>IT HAPPENS.</span>
        </div>
        <a class="contact-link reveal-block" href="mailto:hello@noomoagency.com">
          LET’S WORK TOGETHER <span>↗</span>
        </a>
      </section>
    </main>

    <footer>
      <button class="logo footer-logo" @click="goToSection('.hero')">
        noo<span>m</span>o
      </button>
      <div>
        <span>LOS ANGELES / CALIFORNIA</span>
        <span>© {{ new Date().getFullYear() }} NOOMO STUDY</span>
      </div>
      <button @click="goToSection('.hero')">BACK TO TOP ↑</button>
    </footer>
  </div>
</template>

<style scoped>
@import url("https://fonts.googleapis.com/css2?family=DM+Mono:wght@300;400;500&family=Inter:wght@400;500;600&display=swap");

:global(*) {
  box-sizing: border-box;
}

:global(html) {
  background: #d9e3f3;
}

button,
a {
  font: inherit;
}

.noomo-page {
  --ink: #08090d;
  --ice: #d9e3f3;
  --ice-deep: #cbd8eb;
  --line: rgb(8 9 13 / 26%);
  position: relative;
  width: 100%;
  height: 100%;
  overflow-x: hidden;
  overflow-y: auto;
  color: var(--ink);
  font-family: Inter, Arial, sans-serif;
  background:
    radial-gradient(circle at 47% 13%, rgb(255 228 224 / 72%), transparent 18%),
    radial-gradient(circle at 40% 48%, rgb(255 220 218 / 56%), transparent 16%),
    var(--ice);
  scroll-behavior: auto;
  scrollbar-width: thin;
  scrollbar-color: rgb(8 9 13 / 45%) transparent;
}

.noomo-page:fullscreen {
  height: 100vh;
}

.noomo-page::-webkit-scrollbar {
  width: 6px;
}

.noomo-page::-webkit-scrollbar-thumb {
  background: rgb(8 9 13 / 45%);
  border-radius: 99px;
}

.load-cover {
  position: fixed;
  z-index: 1000;
  display: grid;
  place-items: center;
  width: 100%;
  height: 100%;
  overflow: hidden;
  background: var(--ink);
  pointer-events: none;
}

.load-word {
  display: flex;
  overflow: hidden;
  color: var(--ice);
  font-size: clamp(58px, 9vw, 148px);
  font-weight: 600;
  letter-spacing: -0.09em;
  line-height: 0.8;
}

.load-letter {
  display: inline-block;
}

.site-header {
  position: sticky;
  z-index: 60;
  top: 0;
  left: auto;
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  height: 88px;
  margin-bottom: -88px;
  padding: 29px 3vw;
  mix-blend-mode: multiply;
  pointer-events: none;
}

.site-header button {
  pointer-events: auto;
}

.logo {
  padding: 0;
  color: var(--ink);
  font-size: clamp(25px, 2.4vw, 39px);
  font-weight: 600;
  letter-spacing: -0.1em;
  line-height: 0.8;
  background: none;
  border: 0;
  cursor: pointer;
}

.logo span {
  letter-spacing: -0.14em;
}

.site-header nav {
  display: flex;
  align-items: center;
  gap: clamp(26px, 5.4vw, 78px);
}

.site-header nav button,
.menu-button {
  padding: 6px 0;
  color: var(--ink);
  font-family: "DM Mono", monospace;
  font-size: 12px;
  background: none;
  border: 0;
  cursor: pointer;
}

.site-header nav button::after {
  display: block;
  width: 0;
  height: 1px;
  margin-top: 3px;
  background: currentcolor;
  content: "";
  transition: width 240ms ease;
}

.site-header nav button:hover::after {
  width: 100%;
}

.menu-button {
  display: none;
}

.mobile-menu {
  position: fixed;
  z-index: 55;
  inset: 0;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 12px;
  padding: 8vw;
  background: var(--ink);
  clip-path: inset(0 0 100% 0);
  transition: clip-path 650ms cubic-bezier(0.77, 0, 0.18, 1);
}

.mobile-menu.open {
  clip-path: inset(0);
}

.mobile-menu button {
  padding: 0;
  color: var(--ice);
  font-size: clamp(44px, 14vw, 84px);
  letter-spacing: -0.07em;
  text-align: left;
  background: none;
  border: 0;
}

.fullscreen-button {
  position: fixed;
  z-index: 90;
  right: 24px;
  bottom: 22px;
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 78px;
  height: 40px;
  padding: 0 13px;
  color: var(--ice);
  font-family: "DM Mono", monospace;
  font-size: 10px;
  letter-spacing: 0.06em;
  background: rgb(8 9 13 / 90%);
  border: 1px solid rgb(255 255 255 / 25%);
  border-radius: 99px;
  box-shadow: 0 8px 28px rgb(8 9 13 / 16%);
  cursor: pointer;
  backdrop-filter: blur(10px);
}

.fullscreen-button svg {
  width: 16px;
  fill: none;
  stroke: currentcolor;
  stroke-linecap: square;
  stroke-width: 1.5;
}

main {
  position: relative;
}

.webgl-layer {
  position: sticky;
  z-index: 6;
  top: 0;
  width: 100%;
  height: 100vh;
  margin-bottom: -100vh;
  overflow: hidden;
  pointer-events: none;
}

.webgl-canvas {
  display: block;
  width: 100%;
  height: 100%;
}

.webgl-status {
  position: absolute;
  right: 24px;
  bottom: 74px;
  padding: 7px 11px;
  color: var(--ink);
  font-family: "DM Mono", monospace;
  font-size: 9px;
  letter-spacing: 0.05em;
  background: rgb(217 227 243 / 72%);
  border: 1px solid rgb(8 9 13 / 18%);
  border-radius: 99px;
  backdrop-filter: blur(10px);
}

.webgl-error {
  color: #7d1737;
}

.hero {
  position: relative;
  display: flex;
  align-items: center;
  width: 100%;
  min-height: 100vh;
  overflow: hidden;
}

.ambient {
  position: absolute;
  width: 40vw;
  height: 40vw;
  background: rgb(255 229 226 / 75%);
  border-radius: 50%;
  filter: blur(70px);
  pointer-events: none;
}

.ambient-one {
  top: -19vw;
  left: 33vw;
}

.ambient-two {
  right: -13vw;
  bottom: -23vw;
  opacity: 0.55;
}

.hero-type {
  position: relative;
  z-index: 4;
  width: 100%;
  padding: 7vh 1.8vw 0;
  font-size: clamp(56px, 9.25vw, 145px);
  font-weight: 400;
  letter-spacing: -0.072em;
  line-height: 0.84;
}

.hero-line {
  overflow: hidden;
  white-space: nowrap;
}

.hero-line-inner {
  display: block;
}

.hero-line-two {
  text-align: right;
}

.hero-line i {
  padding-left: 20vw;
  font-style: normal;
}

.hero-intro {
  position: absolute;
  z-index: 5;
  right: 8.2%;
  bottom: 12.5%;
  max-width: 235px;
  margin: 0;
  font-size: clamp(12px, 1.15vw, 17px);
  line-height: 1.28;
}

.scroll-cue {
  position: absolute;
  z-index: 5;
  bottom: 2.3%;
  left: 50%;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 0;
  color: var(--ink);
  font-family: "DM Mono", monospace;
  font-size: 10px;
  background: none;
  border: 0;
  transform: translateX(-50%);
  cursor: pointer;
}

.scroll-cue svg {
  width: 20px;
  fill: none;
  stroke: currentcolor;
  stroke-width: 1.4;
}

.immersive-section {
  position: relative;
  z-index: 3;
  min-height: 100%;
}

.immersive-pin {
  position: relative;
  width: 100%;
  height: 100%;
  min-height: 100vh;
  overflow: hidden;
  background:
    radial-gradient(circle at 46% 45%, rgb(255 222 218 / 82%), transparent 25%),
    var(--ice);
}

.ambient-three {
  top: 12%;
  left: 30%;
}

.immersive-title {
  position: absolute;
  z-index: 4;
  top: 24%;
  left: 0;
  width: 100%;
  font-family: "DM Mono", monospace;
  font-size: clamp(62px, 9vw, 150px);
  font-weight: 300;
  letter-spacing: -0.075em;
  text-align: center;
  white-space: nowrap;
  will-change: transform;
}

.immersive-copy {
  position: absolute;
  z-index: 8;
  right: 7%;
  bottom: 8%;
  width: min(310px, 30vw);
  font-size: 15px;
  line-height: 1.4;
}

.immersive-copy span,
.section-label,
.pill,
.project-meta p,
.quote-person,
.award-row,
.contact-kicker,
footer {
  font-family: "DM Mono", monospace;
}

.immersive-copy span {
  display: block;
  margin-bottom: 13px;
  font-size: 10px;
}

.story-section {
  position: relative;
  padding: 9vw 3vw 11vw;
  background: var(--ice);
  border-top: 1px solid var(--line);
}

.section-label {
  display: flex;
  justify-content: space-between;
  margin-bottom: 9vw;
  font-size: 11px;
}

.manifesto {
  font-size: clamp(44px, 7vw, 112px);
  letter-spacing: -0.07em;
  line-height: 0.9;
}

.manifesto-line:nth-child(2) {
  text-align: right;
}

.manifesto-line:nth-child(3) {
  padding-left: 25%;
}

.story-copy {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 7vw;
  width: min(730px, 64vw);
  margin: 10vw 0 0 auto;
  font-size: clamp(16px, 1.45vw, 21px);
  line-height: 1.35;
}

.story-copy p {
  margin: 0;
}

.services-section {
  position: relative;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8vw;
  padding: 8vw 10vw 14vw;
  overflow: hidden;
  background:
    radial-gradient(circle at 60% 5%, rgb(255 226 222 / 55%), transparent 25%),
    var(--ice-deep);
  border-block: 1px solid var(--line);
}

.service-column {
  position: relative;
  z-index: 2;
}

.pill {
  display: inline-flex;
  align-items: center;
  min-height: 30px;
  margin-bottom: 30px;
  padding: 4px 16px;
  font-size: 12px;
  border: 1px solid var(--ink);
  border-radius: 99px;
}

.face {
  font-family: Inter, sans-serif;
  font-size: 15px;
}

.service-column ul {
  margin: 0;
  padding: 0;
  font-size: clamp(19px, 2vw, 31px);
  letter-spacing: -0.035em;
  line-height: 1.2;
  list-style: none;
}

.client-strip {
  position: absolute;
  right: 0;
  bottom: 2.8vw;
  left: 0;
  overflow: hidden;
  font-family: "DM Mono", monospace;
  font-size: clamp(20px, 3vw, 48px);
  white-space: nowrap;
  transform: rotate(-2deg);
}

.client-strip div {
  width: max-content;
  animation: marquee 23s linear infinite;
}

@keyframes marquee {
  to {
    transform: translateX(-50%);
  }
}

.work-section {
  padding: 9vw 3vw 12vw;
  background: #08090d;
}

.work-section .section-label {
  color: var(--ice);
}

.project-card {
  display: grid;
  grid-template-columns: minmax(0, 2.1fr) minmax(270px, 0.9fr);
  min-height: min(72vw, 860px);
  margin-bottom: 2vw;
  overflow: hidden;
  background: #eceff5;
}

.project-visual {
  position: relative;
  display: grid;
  place-items: center;
  overflow: hidden;
  will-change: transform;
}

.project-violet .project-visual {
  background:
    radial-gradient(circle at 50% 50%, #fdd0c6 0 13%, transparent 14%),
    radial-gradient(circle at 45% 45%, #9071e6 0 22%, transparent 43%),
    #efe9ff;
}

.project-blue .project-visual {
  background:
    radial-gradient(circle at 48% 42%, #bdf7ff 0 13%, transparent 14%),
    radial-gradient(circle at 54% 50%, #4078e2 0 25%, transparent 49%),
    #cbe4ff;
}

.project-coral .project-visual {
  background:
    radial-gradient(circle at 50% 46%, #ffe9a6 0 12%, transparent 13%),
    radial-gradient(circle at 44% 55%, #f66174 0 24%, transparent 50%),
    #ffd8ce;
}

.project-sphere {
  position: absolute;
  z-index: 2;
  width: 31%;
  aspect-ratio: 1;
  background:
    radial-gradient(circle at 32% 25%, rgb(255 255 255 / 90%), transparent 13%),
    radial-gradient(circle at 68% 75%, rgb(9 10 20 / 40%), transparent 48%),
    linear-gradient(140deg, rgb(255 255 255 / 70%), rgb(142 99 230 / 85%));
  border-radius: 50%;
  box-shadow: 0 45px 90px rgb(27 16 66 / 26%);
}

.project-blue .project-sphere {
  background:
    radial-gradient(circle at 32% 25%, #fff, transparent 13%),
    linear-gradient(140deg, #d9fbff, #1967ce 75%);
}

.project-coral .project-sphere {
  background:
    radial-gradient(circle at 32% 25%, #fff, transparent 13%),
    linear-gradient(140deg, #ffe3a7, #ef3d5e 75%);
}

.project-orbit {
  position: absolute;
  z-index: 3;
  width: 53%;
  aspect-ratio: 1.8;
  border: 2px solid rgb(255 255 255 / 86%);
  border-radius: 50%;
  transform: rotate(-21deg);
}

.project-grid {
  position: absolute;
  inset: 0;
  opacity: 0.18;
  background-image:
    linear-gradient(rgb(8 9 13 / 45%) 1px, transparent 1px),
    linear-gradient(90deg, rgb(8 9 13 / 45%) 1px, transparent 1px);
  background-size: 5.5vw 5.5vw;
}

.project-client {
  position: relative;
  z-index: 4;
  font-family: "DM Mono", monospace;
  font-size: clamp(18px, 3vw, 48px);
  letter-spacing: 0.07em;
}

.project-meta {
  position: relative;
  display: flex;
  flex-direction: column;
  padding: 30px;
  border-left: 1px solid var(--line);
}

.project-meta > span:first-child {
  font-family: "DM Mono", monospace;
  font-size: 11px;
}

.project-meta h3 {
  margin: auto 0 20px;
  font-size: clamp(32px, 4.2vw, 68px);
  font-weight: 400;
  letter-spacing: -0.065em;
  line-height: 0.95;
}

.project-meta p {
  margin: 0 0 6px;
  font-size: 10px;
}

.round-arrow {
  display: grid;
  place-items: center;
  width: 42px;
  height: 42px;
  margin-top: 20px;
  border: 1px solid var(--ink);
  border-radius: 50%;
}

.team-section {
  padding: 9vw 3vw 11vw;
  background: var(--ice);
}

.team-section h2 {
  margin: 0;
  font-size: clamp(50px, 8.4vw, 134px);
  font-weight: 400;
  letter-spacing: -0.075em;
  line-height: 0.84;
}

.team-copy {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 6vw;
  width: min(760px, 65vw);
  margin: 9vw 4vw 0 auto;
  font-size: clamp(16px, 1.4vw, 21px);
  line-height: 1.35;
}

.team-copy p {
  margin: 0;
}

.testimonial-section {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  background: #c6d3e7;
  border-top: 1px solid var(--line);
}

.quote-card {
  display: flex;
  flex-direction: column;
  min-height: 590px;
  padding: 34px;
  border-right: 1px solid var(--line);
}

.quote-number {
  font-family: "DM Mono", monospace;
  font-size: 11px;
}

.quote-card blockquote {
  margin: auto 0;
  font-size: clamp(20px, 2vw, 31px);
  letter-spacing: -0.04em;
  line-height: 1.18;
}

.quote-person {
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 9px;
  line-height: 1.3;
}

.quote-person strong {
  font-size: 11px;
}

.awards-section {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 7vw;
  padding: 10vw 3vw;
  background: #08090d;
  color: var(--ice);
}

.awards-heading > span {
  font-family: "DM Mono", monospace;
  font-size: 10px;
}

.awards-heading h2 {
  margin: 4vw 0 0;
  font-size: clamp(43px, 6vw, 95px);
  font-weight: 400;
  letter-spacing: -0.07em;
  line-height: 0.9;
}

.award-table {
  align-self: end;
  border-top: 1px solid rgb(217 227 243 / 45%);
}

.award-row {
  display: grid;
  grid-template-columns: 1.2fr 1fr 44px;
  gap: 18px;
  padding: 18px 0;
  font-size: 10px;
  line-height: 1.4;
  border-bottom: 1px solid rgb(217 227 243 / 28%);
}

.award-head {
  opacity: 0.5;
}

.contact-section {
  min-height: 100vh;
  padding: 9vw 3vw 5vw;
  background:
    radial-gradient(circle at 68% 34%, rgb(255 224 220 / 92%), transparent 22%),
    var(--ice);
}

.contact-kicker {
  width: min(770px, 72vw);
  margin: 0 0 16vh auto;
  font-size: clamp(15px, 1.55vw, 24px);
  line-height: 1.3;
}

.contact-title {
  display: flex;
  flex-direction: column;
  font-size: clamp(65px, 12vw, 190px);
  letter-spacing: -0.085em;
  line-height: 0.76;
}

.contact-title span:last-child {
  align-self: flex-end;
}

.contact-link {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 12vh;
  padding: 18px 0;
  color: var(--ink);
  font-family: "DM Mono", monospace;
  font-size: 12px;
  text-decoration: none;
  border-block: 1px solid var(--ink);
}

.contact-link span {
  font-size: 24px;
}

footer {
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  align-items: end;
  gap: 30px;
  padding: 6vw 3vw 3vw;
  background: var(--ice);
  font-size: 9px;
  border-top: 1px solid var(--line);
}

.footer-logo {
  justify-self: start;
}

footer > div {
  display: flex;
  gap: 25px;
}

footer > button:last-child {
  justify-self: end;
  padding: 0;
  color: var(--ink);
  font-family: "DM Mono", monospace;
  font-size: 9px;
  background: none;
  border: 0;
  cursor: pointer;
}

@media (max-width: 820px) {
  .site-header {
    height: 72px;
    margin-bottom: -72px;
    padding: 22px 20px;
    mix-blend-mode: normal;
  }

  .site-header nav {
    display: none;
  }

  .menu-button {
    display: block;
  }

  .mobile-menu.open ~ .fullscreen-button {
    opacity: 0;
    pointer-events: none;
  }

  .hero {
    min-height: 100vh;
    align-items: flex-start;
    padding-top: 21vh;
  }

  .hero-type {
    padding: 0 18px;
    font-size: clamp(55px, 18.8vw, 110px);
    line-height: 0.78;
  }

  .hero-line {
    overflow: visible;
    white-space: normal;
  }

  .hero-line-two {
    text-align: left;
  }

  .hero-line i {
    display: block;
    padding-left: 25%;
  }

  .hero-intro {
    right: auto;
    bottom: 8.5%;
    left: 20px;
    max-width: 250px;
    font-size: 13px;
  }

  .scroll-cue {
    right: 22px;
    bottom: 8.5%;
    left: auto;
    transform: none;
  }

  .fullscreen-button {
    right: 14px;
    bottom: 14px;
  }

  .webgl-status {
    right: 14px;
    bottom: 68px;
  }

  .immersive-title {
    top: 23%;
    font-size: 18vw;
  }

  .immersive-copy {
    right: 20px;
    bottom: 7%;
    width: calc(100% - 40px);
    max-width: none;
  }

  .story-section,
  .work-section,
  .team-section,
  .awards-section {
    padding: 86px 20px;
  }

  .section-label {
    margin-bottom: 84px;
  }

  .manifesto {
    font-size: clamp(45px, 14.5vw, 80px);
    line-height: 0.88;
  }

  .manifesto-line:nth-child(2) {
    text-align: left;
  }

  .manifesto-line:nth-child(3) {
    padding-left: 0;
  }

  .story-copy,
  .team-copy {
    grid-template-columns: 1fr;
    width: 100%;
    margin-top: 90px;
    font-size: 17px;
  }

  .services-section {
    grid-template-columns: 1fr;
    gap: 74px;
    padding: 78px 20px 150px;
  }

  .service-column ul {
    font-size: 24px;
  }

  .client-strip {
    bottom: 40px;
  }

  .project-card {
    grid-template-columns: 1fr;
    min-height: 720px;
    margin-bottom: 18px;
  }

  .project-visual {
    min-height: 430px;
  }

  .project-meta {
    min-height: 290px;
    border-top: 1px solid var(--line);
    border-left: 0;
  }

  .project-meta h3 {
    margin-top: 60px;
  }

  .team-section h2 {
    font-size: 16.2vw;
  }

  .testimonial-section {
    grid-template-columns: 1fr;
  }

  .quote-card {
    min-height: 530px;
    border-right: 0;
    border-bottom: 1px solid var(--line);
  }

  .awards-section {
    grid-template-columns: 1fr;
  }

  .awards-heading h2 {
    margin: 50px 0 90px;
    font-size: 13vw;
  }

  .award-row {
    grid-template-columns: 1.1fr 1fr 38px;
    gap: 10px;
    font-size: 8px;
  }

  .contact-section {
    min-height: 100%;
    padding: 90px 20px 60px;
  }

  .contact-kicker {
    width: 100%;
    margin-bottom: 20vh;
    font-size: 14px;
  }

  .contact-title {
    font-size: 19vw;
  }

  footer {
    grid-template-columns: 1fr auto;
    padding: 50px 20px 25px;
  }

  footer > div {
    display: none;
  }
}

@media (prefers-reduced-motion: reduce) {
  .client-strip div {
    animation-play-state: paused;
  }

  .mobile-menu {
    transition-duration: 0.01ms;
  }
}
</style>
