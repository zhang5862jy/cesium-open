<script setup lang="ts">
import { computed, nextTick, ref, watch } from "vue";
import { useRoute } from "vue-router";
import { exampleCatalog, exampleRootConfig } from "./examples/config";

const route = useRoute();
const contentElement = ref<HTMLElement>();
const isHomePage = computed(() => route.name === "home");
const activeGroup = computed(() =>
  isHomePage.value ? route.hash.slice(1) : route.meta.exampleGroup,
);
const backTarget = computed(() => {
  const group = exampleCatalog.find(
    ({ directoryPath }) => directoryPath === route.meta.exampleGroup,
  );

  return group ? { path: "/", hash: `#${group.directoryPath}` } : { path: "/" };
});

function scrollToCatalogSection(groupPath: string) {
  const content = contentElement.value;
  const target = document.getElementById(groupPath);
  if (!content || !target) return;

  const contentRect = content.getBoundingClientRect();
  const targetRect = target.getBoundingClientRect();
  const top = content.scrollTop + targetRect.top - contentRect.top - 24;

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  content.scrollTo({
    top: Math.max(0, top),
    behavior: reduceMotion.matches ? "instant" : "smooth",
  });
}

function handleCatalogLinkClick(event: MouseEvent, groupPath: string) {
  if (
    !isHomePage.value ||
    event.button ||
    event.metaKey ||
    event.ctrlKey ||
    event.shiftKey ||
    event.altKey
  ) {
    return;
  }

  if (!groupPath) {
    contentElement.value?.scrollTo({ top: 0 });
  } else if (activeGroup.value === groupPath) {
    scrollToCatalogSection(groupPath);
  }
}

watch(
  () => [route.name, route.hash] as const,
  async ([routeName, hash]) => {
    if (routeName !== "home") return;

    await nextTick();
    const groupPath = hash.slice(1);

    if (groupPath) {
      scrollToCatalogSection(groupPath);
    } else {
      contentElement.value?.scrollTo({ top: 0 });
    }
  },
  { immediate: true, flush: "post" },
);
</script>

<template>
  <div class="app-shell" :class="{ 'is-example': !isHomePage }">
    <aside class="sidebar">
      <RouterLink
        to="/"
        class="brand"
        @click="handleCatalogLinkClick($event, '')"
      >
        <span class="brand-mark" aria-hidden="true"></span>
        <strong>{{ exampleRootConfig.name }}</strong>
      </RouterLink>

      <RouterLink v-if="!isHomePage" :to="backTarget" class="back-link">
        <span aria-hidden="true">←</span>
        返回目录
      </RouterLink>

      <nav
        v-if="exampleCatalog.length"
        class="category-nav"
        aria-label="示例分类"
      >
        <p class="nav-heading" aria-hidden="true">示例分类</p>
        <RouterLink
          v-for="{ directoryPath, name, childrens } in exampleCatalog"
          :key="directoryPath"
          v-slot="{ href, navigate }"
          :to="{ path: '/', hash: `#${directoryPath}` }"
          custom
        >
          <a
            :href="href"
            class="category-link"
            :aria-current="
              activeGroup === directoryPath ? 'location' : undefined
            "
            @click="
              handleCatalogLinkClick($event, directoryPath);
              navigate($event);
            "
          >
            <span>{{ name }}</span>
            <span class="nav-count" aria-hidden="true">{{
              childrens.length
            }}</span>
          </a>
        </RouterLink>
      </nav>
    </aside>

    <main ref="contentElement" class="content">
      <RouterView />
    </main>
  </div>
</template>

<style scoped>
.app-shell {
  --surface: #edf2f2;
  --paper: #f9fbfa;
  --ink: #17313b;
  --muted: #4f666e;
  --border: #d0dddf;
  --accent: #126c60;
  --accent-soft: #e2efea;

  display: grid;
  grid-template-columns: 238px minmax(0, 1fr);
  grid-template-rows: minmax(0, 1fr);
  width: 100%;
  height: 100%;
  min-height: 0;
  color: var(--ink);
  background: var(--surface);
}

.sidebar {
  position: relative;
  z-index: 20;
  min-width: 0;
  padding: 28px 16px;
  overflow: auto;
  background: var(--paper);
  border-right: 1px solid var(--border);
}

.brand {
  display: flex;
  align-items: center;
  gap: 11px;
  min-height: 40px;
  margin-inline: 8px;
  color: var(--ink);
  font-size: 15px;
  text-decoration: none;
}

.brand-mark {
  position: relative;
  display: grid;
  flex: 0 0 36px;
  place-items: center;
  width: 36px;
  height: 36px;
  color: #e5f5eb;
  background: #19534d;
  border-radius: 10px;
}

.brand-mark::before,
.brand-mark::after {
  position: absolute;
  height: 19px;
  border: 1px solid currentColor;
  border-radius: 50%;
  content: "";
  transform: rotate(24deg);
}

.brand-mark::before {
  width: 19px;
}

.brand-mark::after {
  width: 8px;
  background: linear-gradient(
    transparent calc(50% - 0.5px),
    currentColor calc(50% - 0.5px) calc(50% + 0.5px),
    transparent calc(50% + 0.5px)
  );
}

.back-link {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 40px;
  margin-top: 20px;
  padding: 0 12px;
  color: var(--accent);
  font-size: 13px;
  font-weight: 650;
  text-decoration: none;
  border: 1px solid var(--border);
  border-radius: 9px;
}

.back-link:hover {
  background: var(--accent-soft);
}

.category-nav {
  display: grid;
  gap: 4px;
  margin-top: 29px;
  padding-top: 18px;
  border-top: 1px solid var(--border);
}

.nav-heading {
  margin: 0 12px 8px;
  color: var(--muted);
  font-size: 12px;
  font-weight: 650;
}

.category-link {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  min-height: 42px;
  padding: 0 12px;
  color: var(--muted);
  font-size: 13px;
  font-weight: 550;
  text-decoration: none;
  border-radius: 8px;
  transition:
    color 160ms ease,
    background-color 160ms ease;
}

.category-link:hover,
.category-link[aria-current] {
  color: var(--accent);
  background: var(--accent-soft);
}

.category-link[aria-current] {
  box-shadow: inset 3px 0 var(--accent);
}

.nav-count {
  font-size: 11px;
  font-variant-numeric: tabular-nums;
}

.brand:focus-visible,
.back-link:focus-visible,
.category-link:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

.content {
  position: relative;
  min-width: 0;
  min-height: 0;
  height: 100%;
  overflow: auto;
}

@media (max-width: 760px) {
  .app-shell {
    grid-template-columns: minmax(0, 1fr);
    grid-template-rows: auto minmax(0, 1fr);
  }

  .sidebar {
    padding: 10px 16px 4px;
    overflow: visible;
    border-right: 0;
    border-bottom: 1px solid var(--border);
  }

  .brand {
    margin-inline: 0;
  }

  .category-nav {
    display: flex;
    gap: 5px;
    margin: 7px -4px 0;
    padding: 4px;
    overflow-x: auto;
    border-top: 0;
    scrollbar-width: thin;
  }

  .nav-heading {
    display: none;
  }

  .category-link {
    flex-shrink: 0;
    min-height: 34px;
    padding: 0 10px;
  }

  .category-link[aria-current] {
    box-shadow: inset 0 -2px var(--accent);
  }
}

@media (max-width: 900px) {
  .app-shell.is-example {
    grid-template-columns: minmax(0, 1fr);
    grid-template-rows: auto minmax(0, 1fr);
  }

  .is-example .sidebar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding: 6px 12px;
    border-right: 0;
    border-bottom: 1px solid var(--border);
  }

  .is-example .brand {
    min-width: 0;
    margin: 0;
  }

  .is-example .brand strong {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .is-example .back-link {
    flex-shrink: 0;
    min-height: 34px;
    margin: 0;
  }

  .is-example .category-nav {
    display: none;
  }
}

@media (prefers-reduced-motion: reduce) {
  .category-link {
    transition: none;
  }
}
</style>
