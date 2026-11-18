import {
  createRouter,
  createWebHistory,
  type RouteComponent,
  type RouteRecordRaw,
} from "vue-router";
import { exampleConfig } from "../examples/config";
import ExampleLayout from "../views/ExampleLayout.vue";
import HomeView from "../views/HomeView.vue";

const exampleRoutes: RouteRecordRaw[] = exampleConfig.flatMap((group) =>
  group.childrens.map(
    (example) =>
      ({
        path: example.routePath.replace("/examples/", ""),
        name: `example:${example.filePath}`,
        component: example.component as () => Promise<RouteComponent>,
        meta: {
          examplePath: example.filePath,
          exampleGroup: group.directoryPath,
        },
      }) as RouteRecordRaw,
  ),
);

export const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: "/",
      name: "home",
      component: HomeView,
    },
    {
      path: "/examples",
      component: ExampleLayout,
      children: exampleRoutes,
    },
    {
      path: "/:pathMatch(.*)*",
      redirect: "/",
    },
  ],
});
