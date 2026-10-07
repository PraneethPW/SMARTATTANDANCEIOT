import { useEffect, useState } from "react";

export function useDashboardNavigation<T extends string>(
  initial: T,
  sections: readonly T[],
  onHome: () => void,
) {
  const readSection = () => {
    const section = new URLSearchParams(window.location.search).get("section");
    return sections.includes(section as T) ? (section as T) : initial;
  };
  const [tab, updateTab] = useState<T>(readSection);
  const sectionKey = sections.join("|");

  useEffect(() => {
    const onPopState = () => updateTab(readSection());
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [initial, sectionKey]);

  const setTab = (next: T) => {
    if (next === tab || !sections.includes(next)) return;
    const url = new URL(window.location.href);
    if (next === initial) url.searchParams.delete("section");
    else url.searchParams.set("section", next);
    window.history.pushState(
      { transitsyncSection: true },
      "",
      url.pathname + url.search,
    );
    updateTab(next);
    window.scrollTo(0, 0);
  };

  const goBack = () => {
    if (window.history.state?.transitsyncSection) window.history.back();
    else onHome();
  };

  return { tab, setTab, goBack };
}
