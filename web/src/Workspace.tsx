import { type ComponentChildren } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";
type Layout = {
  right: number;
  bottom: number;
  leftOpen: boolean;
  rightOpen: boolean;
};
const initial: Layout = {
  right: 340,
  bottom: 250,
  leftOpen: innerWidth > 700,
  rightOpen: innerWidth > 1200,
};
export function Workspace(p: {
  left: ComponentChildren;
  center: ComponentChildren;
  right: ComponentChildren;
  bottom: ComponentChildren;
  context: ComponentChildren;
}) {
  const [layout, setLayout] = useState<Layout>(() => {
    try {
      return {
        ...initial,
        ...JSON.parse(localStorage.getItem("hazard-atlas-layout") || "{}"),
      };
    } catch {
      return initial;
    }
  });
  const [mobile, setMobile] = useState("Globe");
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const select = () => {
      if (root.current?.offsetParent) {
        setLayout((v) => ({
          ...v,
          rightOpen: true,
          leftOpen: innerWidth > 700 ? v.leftOpen : false,
        }));
        if (innerWidth <= 700) setMobile("Learn");
      }
    };
    window.addEventListener("hazard-atlas-selection", select);
    return () => window.removeEventListener("hazard-atlas-selection", select);
  }, []);
  const clamp = (v: Layout): Layout => ({
    ...v,
    right: Math.max(280, Math.min(Number(v.right) || 340, innerWidth * 0.4)),
    bottom: Math.max(
      140,
      Math.min(Number(v.bottom) || 220, innerHeight * 0.45),
    ),
  });
  useEffect(() => {
    const resize = () =>
      setLayout((v) =>
        clamp({
          ...v,
          rightOpen: innerWidth > 1200 && v.rightOpen,
          leftOpen: innerWidth > 700 && v.leftOpen,
        }),
      );
    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem("hazard-atlas-layout", JSON.stringify(layout));
    } catch {}
  }, [layout]);
  const size = (key: "right" | "bottom", n: number) =>
    setLayout((v) => clamp({ ...v, [key]: n }));
  const splitter = (key: "right" | "bottom") => (
    <div
      class={"splitter " + key}
      role="separator"
      tabIndex={0}
      aria-label={key === "right" ? "Resize details" : "Resize event list"}
      aria-orientation={key === "right" ? "vertical" : "horizontal"}
      aria-valuenow={Math.round(layout[key])}
      aria-valuemin={key === "right" ? 280 : 140}
      aria-valuemax={Math.round(
        key === "right" ? innerWidth * 0.4 : innerHeight * 0.45,
      )}
      onKeyDown={(e) => {
        if (
          ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key)
        ) {
          e.preventDefault();
          size(
            key,
            layout[key] + (["ArrowLeft", "ArrowUp"].includes(e.key) ? 20 : -20),
          );
        }
      }}
      onPointerDown={(e) => {
        e.preventDefault();
        e.stopPropagation();
        e.currentTarget.setPointerCapture(e.pointerId);
      }}
      onPointerMove={(e) => {
        if (e.currentTarget.hasPointerCapture(e.pointerId)) {
          const r = root.current!.getBoundingClientRect();
          size(
            key,
            key === "right" ? r.right - e.clientX : r.bottom - e.clientY,
          );
        }
      }}
      onPointerUp={(e) => {
        if (e.currentTarget.hasPointerCapture(e.pointerId))
          e.currentTarget.releasePointerCapture(e.pointerId);
      }}
    />
  );
  return (
    <div class="workspace-frame">
      <div class="workspace-actions">
        <button
          aria-expanded={layout.leftOpen}
          onClick={() => setLayout((v) => ({ ...v, leftOpen: !v.leftOpen }))}
        >
          Layers & filters
        </button>
        <button
          aria-expanded={layout.rightOpen}
          onClick={() => setLayout((v) => ({ ...v, rightOpen: !v.rightOpen }))}
        >
          Details & learning
        </button>
        <button
          onClick={() => {
            setMobile("Globe");
            setLayout((v) => ({
              ...v,
              leftOpen: false,
              rightOpen: false,
              bottom: 140,
            }));
          }}
        >
          Globe focus
        </button>
        <button onClick={() => setLayout(clamp(initial))}>Reset layout</button>
        <span class="workspace-context">{p.context}</span>
      </div>
      <nav class="mobile-tabs" aria-label="Workspace view">
        {["Globe", "List", "Learn"].map((v) => (
          <button aria-pressed={mobile === v} onClick={() => setMobile(v)}>
            {v}
          </button>
        ))}
      </nav>
      <div
        ref={root}
        class={`workspace ${layout.leftOpen ? "" : "left-closed"} ${layout.rightOpen ? "" : "right-closed"} mobile-${mobile.toLowerCase()}`}
        style={{
          "--right": layout.right + "px",
          "--bottom": layout.bottom + "px",
        }}
      >
        <aside class="workspace-left" aria-label="Layers and filters">
          {p.left}
        </aside>
        <section class="workspace-center" aria-label="Globe workspace">
          {p.center}
        </section>
        {layout.rightOpen && splitter("right")}
        <aside class="workspace-right" aria-label="Details and learning">
          {p.right}
        </aside>
        {splitter("bottom")}
        <section class="workspace-bottom" aria-label="Timeline and event list">
          {p.bottom}
        </section>
      </div>
    </div>
  );
}
