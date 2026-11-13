"use client";

import { useEffect, useRef, useState } from "react";
import type { Game as Engine } from "./engine";
import Hud from "./Hud";

export default function Game() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const [engine, setEngine] = useState<Engine | null>(null);

  useEffect(() => {
    let game: Engine | null = null;
    let cancelled = false;
    // three.js only runs in the browser, so the engine is loaded after mount
    import("./engine").then(({ Game: G }) => {
      if (cancelled || !canvasRef.current || !overlayRef.current) return;
      game = new G(canvasRef.current, overlayRef.current);
      setEngine(game);
      if (process.env.NODE_ENV !== "production") (window as unknown as { __game?: Engine }).__game = game;
    });
    return () => {
      cancelled = true;
      game?.dispose();
      setEngine(null);
    };
  }, []);

  return (
    <div className="stage">
      <canvas ref={canvasRef} className="stage-canvas" />
      <div ref={overlayRef} className="stage-overlay" />
      <Hud engine={engine} />
    </div>
  );
}
