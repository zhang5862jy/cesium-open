<script setup lang="ts">
import { gsap } from "gsap";
import { onMounted, onUnmounted, ref } from "vue";
import catalogGlobe from "../assets/catalog-globe.webp";
import { exampleCatalog } from "../examples/config";

const page = ref<HTMLElement>();
const exampleCount = exampleCatalog.reduce(
  (count, group) => count + group.childrens.length,
  0,
);
const featuredExample = exampleCatalog
  .find((group) => group.directoryPath === "terrain")
  ?.childrens.find((example) => example.directoryPath === "terrain/local-dem");

let motion: gsap.MatchMedia | undefined;

onMounted(() => {
  const root = page.value;
  if (!root) return;

  motion = gsap.matchMedia(root);
  motion.add("(prefers-reduced-motion: no-preference)", () => {
    gsap
      .timeline({ defaults: { ease: "power3.out" } })
      .from(".hero-copy", { y: 16, opacity: 0, duration: 0.46 }, 0)
      .from(
        ".hero-globe",
        { x: 28, scale: 0.94, rotation: -5, opacity: 0, duration: 0.85 },
        0.08,
      );
  });

  motion.add(
    "(prefers-reduced-motion: no-preference) and (hover: hover)",
    () => {
      const listeners = new AbortController();
      const options = { signal: listeners.signal };

      for (const card of root.querySelectorAll(".example-card")) {
        const preview = card.querySelector("img");
        if (!preview) continue;

        const zoom = gsap.to(preview, {
          scale: 1.055,
          ease: "power2.out",
          duration: 0.38,
          paused: true,
        });
        card.addEventListener("mouseenter", () => zoom.play(), options);
        card.addEventListener("mouseleave", () => zoom.reverse(), options);
      }

      return () => listeners.abort();
    },
  );
});

onUnmounted(() => motion?.revert());

function hideMissingPreview(event: Event) {
  if (event.target instanceof HTMLImageElement) {
    event.target.hidden = true;
  }
}
</script>

<template>
  <div ref="page" class="catalog-page">
    <header class="catalog-hero">
      <div class="hero-copy">
        <h1>
          <span class="hero-wordmark">Cesium</span>
          <span>功能示例</span>
        </h1>
        <p>
          {{ exampleCatalog.length }} 个分类，{{ exampleCount }} 个可运行示例
        </p>
        <RouterLink
          v-if="featuredExample"
          :to="featuredExample.routePath"
          class="hero-link"
        >
          {{ featuredExample.name }}
          <span aria-hidden="true">↗</span>
        </RouterLink>
      </div>

      <div class="hero-art" aria-hidden="true">
        <img
          class="hero-globe"
          :src="catalogGlobe"
          alt=""
          width="820"
          height="820"
          fetchpriority="high"
        />
      </div>
    </header>

    <section
      v-for="group in exampleCatalog"
      :id="group.directoryPath"
      :key="group.directoryPath"
      class="example-section"
    >
      <div class="section-heading">
        <h2>{{ group.name }}</h2>
        <span>{{ group.childrens.length }} 个示例</span>
      </div>

      <div class="example-grid">
        <RouterLink
          v-for="example in group.childrens"
          :key="example.directoryPath"
          :to="example.routePath"
          class="example-card"
        >
          <div class="preview-frame">
            <span class="preview-placeholder">暂无预览</span>
            <img
              :src="example.previewPath"
              alt=""
              loading="lazy"
              decoding="async"
              @error="hideMissingPreview"
            />
          </div>
          <div class="card-copy">
            <div class="card-title">
              <h3>{{ example.name }}</h3>
              <span class="card-arrow" aria-hidden="true">↗</span>
            </div>
            <p v-if="example.description">{{ example.description }}</p>
          </div>
        </RouterLink>
      </div>
    </section>

    <p v-if="!exampleCount" class="empty-catalog">暂无可浏览的示例。</p>
  </div>
</template>

<style scoped>
.catalog-page {
  width: min(1320px, calc(100% - 2 * clamp(24px, 3.6vw, 60px)));
  margin-inline: auto;
  padding: clamp(24px, 3.5vw, 48px) 0 72px;
}

.catalog-hero {
  position: relative;
  display: grid;
  align-items: center;
  min-height: clamp(300px, 29vw, 396px);
  overflow: hidden;
  isolation: isolate;
  color: #f0f6ed;
  background: #142b35;
  border: 1px solid #25434a;
  border-radius: 24px;
}

.hero-copy {
  z-index: 1;
  width: 56%;
  padding: clamp(28px, 4vw, 64px);
}

.hero-copy h1 {
  display: grid;
  gap: 9px;
  font-size: clamp(27px, 3vw, 42px);
  font-weight: 600;
  line-height: 1.14;
  letter-spacing: 0.06em;
}

.hero-wordmark {
  font-family: Georgia, "Times New Roman", serif;
  font-size: clamp(63px, 6.2vw, 106px);
  font-weight: 400;
  line-height: 0.94;
  letter-spacing: -0.055em;
}

.hero-copy p {
  margin-top: 19px;
  color: #bdd5d2;
  font-size: 14px;
  line-height: 1.6;
}

.hero-link {
  display: inline-flex;
  align-items: center;
  gap: 12px;
  min-height: 40px;
  margin-top: 24px;
  padding: 0 14px;
  color: #17313b;
  font-size: 13px;
  font-weight: 700;
  text-decoration: none;
  background: #f1d994;
  border-radius: 8px;
}

.hero-link:hover {
  background: #ffecb2;
}

.hero-link:focus-visible {
  outline: 2px solid #f1d994;
  outline-offset: 4px;
}

.hero-art {
  position: absolute;
  inset: 0 0 0 auto;
  display: grid;
  place-items: center;
  width: 58%;
  pointer-events: none;
  background:
    radial-gradient(ellipse at center, #31615e 0%, transparent 64%),
    repeating-linear-gradient(0deg, #a8cdca13 0 1px, transparent 1px 44px),
    repeating-linear-gradient(90deg, #a8cdca13 0 1px, transparent 1px 44px);
  mask-image: linear-gradient(90deg, transparent, black 24%);
}

.hero-globe {
  display: block;
  width: min(86%, 510px);
  height: auto;
  max-width: none;
  filter: drop-shadow(0 12px 40px #081b20a0);
}

.example-section {
  padding-top: clamp(36px, 4vw, 56px);
  scroll-margin-top: 24px;
}

.section-heading {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 17px;
  padding-bottom: 13px;
  border-bottom: 1px solid var(--border);
}

.section-heading h2 {
  color: var(--ink);
  font-size: clamp(19px, 2vw, 24px);
  font-weight: 700;
  letter-spacing: 0.01em;
}

.section-heading > span {
  flex-shrink: 0;
  color: var(--muted);
  font-size: 12px;
}

.example-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(min(100%, 286px), 1fr));
  gap: 17px;
}

.example-card {
  display: flex;
  flex-direction: column;
  min-width: 0;
  padding: 8px;
  color: var(--ink);
  text-decoration: none;
  background: var(--paper);
  border: 1px solid var(--border);
  border-radius: 14px;
  transition:
    border-color 180ms ease,
    box-shadow 180ms ease;
}

.example-card:hover,
.example-card:focus-visible {
  border-color: var(--accent);
  box-shadow: 0 10px 26px rgb(23 49 59 / 9%);
}

.example-card:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 3px;
}

.preview-frame {
  position: relative;
  display: grid;
  place-items: center;
  overflow: hidden;
  aspect-ratio: 16 / 9;
  background:
    repeating-linear-gradient(0deg, #a8cdca20 0 1px, transparent 1px 26px),
    repeating-linear-gradient(90deg, #a8cdca20 0 1px, transparent 1px 26px),
    #24414a;
  border-radius: 8px;
}

.preview-frame img {
  position: absolute;
  inset: 0;
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.preview-frame img[hidden] {
  display: none;
}

.preview-placeholder {
  color: #dce9e7;
  font-size: 12px;
}

.preview-frame:has(img:not([hidden])) .preview-placeholder {
  visibility: hidden;
}

.card-copy {
  padding: 10px 8px 8px;
}

.card-title {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
}

.card-title h3 {
  align-self: center;
  font-size: 15px;
  font-weight: 700;
  line-height: 1.5;
}

.card-arrow {
  display: grid;
  flex: 0 0 27px;
  place-items: center;
  height: 27px;
  color: var(--accent);
  font-size: 16px;
  background: var(--accent-soft);
  border-radius: 7px;
  transition:
    color 180ms ease,
    background-color 180ms ease;
}

.example-card:hover .card-arrow,
.example-card:focus-visible .card-arrow {
  color: white;
  background: var(--accent);
}

.card-copy p,
.empty-catalog {
  margin-top: 6px;
  color: var(--muted);
  font-size: 13px;
  line-height: 1.65;
}

.empty-catalog {
  margin-top: 24px;
}

@media (max-width: 760px) {
  .catalog-page {
    width: calc(100% - 32px);
    padding-bottom: 48px;
  }
}

@media (max-width: 520px) {
  .catalog-hero {
    min-height: 0;
    border-radius: 18px;
  }

  .hero-copy {
    width: 100%;
    padding: 26px 22px 16px;
  }

  .hero-art {
    position: relative;
    inset: auto;
    place-items: start center;
    width: 100%;
    height: 138px;
    mask-image: linear-gradient(transparent, black 22%);
  }

  .hero-globe {
    width: min(80%, 310px);
  }
}

@media (prefers-reduced-motion: reduce) {
  .example-card,
  .card-arrow {
    transition: none;
  }
}
</style>
