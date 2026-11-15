"use client";

import { useEffect, useState } from "react";
import type { Game as Engine } from "./engine";
import { ACTIONS, CHORES, FUN, type ActionId } from "./data";
import { useHud } from "./store";

function Bar({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className="bar">
      <span className="bar-label">{label}</span>
      <span className="bar-track">
        <span className={`bar-fill ${tone}`} style={{ width: `${Math.round(value * 100)}%` }} />
      </span>
    </div>
  );
}

function Intro({ engine }: { engine: Engine | null }) {
  const hud = useHud();
  const [name, setName] = useState("");
  useEffect(() => {
    try {
      const saved = localStorage.getItem("apartment.name");
      // eslint-disable-next-line react-hooks/set-state-in-effect -- one-off read of a saved value after mount
      if (saved) setName(saved);
    } catch {}
  }, []);
  const ready = hud.phase === "intro" && engine;
  return (
    <div className="intro">
      <form
        className="intro-card"
        onSubmit={(e) => {
          e.preventDefault();
          if (ready) engine.start(name);
        }}
      >
        <p className="eyebrow">Apartment 3D · roommate simulator</p>
        <h1>
          The chores won&rsquo;t <em>do themselves.</em>
        </h1>
        <p className="intro-copy">
          Your roommate is in bed. The sink is full. Tap things around the apartment to tell him what to do, and keep him
          fed and rested or he goes on strike.
        </p>
        <label className="field">
          <span>What&rsquo;s his name?</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Roomie"
            maxLength={18}
            autoComplete="off"
          />
        </label>
        {hud.loadError ? (
          <p className="intro-error">Couldn&rsquo;t load the apartment: {hud.loadError}. Try refreshing.</p>
        ) : (
          <button className="cta" type="submit" disabled={!ready}>
            {ready ? "Wake him up" : `Unpacking boxes… ${Math.round(hud.loadProgress * 100)}%`}
            {!ready && <span className="cta-progress" style={{ width: `${hud.loadProgress * 100}%` }} />}
          </button>
        )}
        <p className="hint">Drag to move · right-drag or two fingers to rotate · scroll or pinch to zoom</p>
      </form>
    </div>
  );
}

export default function Hud({ engine }: { engine: Engine | null }) {
  const hud = useHud();
  // phones show one group of actions at a time, and tuck the camera tools away
  const [tab, setTab] = useState<"chores" | "treats" | "chaos">("chores");
  const [toolsOpen, setToolsOpen] = useState(false);
  const partying = hud.party;
  const spinning = hud.spinning;
  useEffect(() => {
    document.body.dataset.spin = spinning ? "1" : "0";
    return () => {
      delete document.body.dataset.spin;
    };
  }, [spinning]);
  useEffect(() => {
    // the page backdrop goes dark while the party is on
    document.body.dataset.party = partying ? "1" : "0";
    return () => {
      delete document.body.dataset.party;
    };
  }, [partying]);
  if (hud.phase !== "playing" || !engine) return <Intro engine={engine} />;

  const pct = Math.round(hud.cleanliness * 100);
  const grade = pct >= 85 ? "Sparkling" : pct >= 65 ? "Tidy" : pct >= 45 ? "Lived-in" : pct >= 25 ? "Grim" : "Biohazard";
  const dockButton = (id: ActionId) => {
    const a = ACTIONS[id];
    const dirt = a.kind === "chore" ? hud.dirt[id as keyof typeof hud.dirt] : null;
    const queued = hud.queue.some((q) => q.actionId === id);
    return (
      <button
        key={id}
        type="button"
        className={`dock-btn ${a.kind}${queued ? " queued" : ""}`}
        data-level={dirt === null ? undefined : dirt > 0.7 ? "high" : dirt > 0.4 ? "mid" : "low"}
        onClick={() => engine.enqueue(id)}
        title={a.label}
      >
        <span className="dock-icon">{a.icon}</span>
        <span className="dock-label">{a.label}</span>
        {dirt !== null && (
          <span className="dock-meter">
            <span style={{ width: `${Math.round(dirt * 100)}%` }} />
          </span>
        )}
      </button>
    );
  };

  return (
    <div className="hud">
      <section className="card who">
        <div className="who-top">
          <span className="avatar" data-mood={hud.moodLabel}>
            {hud.moodIcon}
          </span>
          <div>
            <h2>{hud.name}</h2>
            <p className="mood">{hud.moodLabel}</p>
          </div>
          <button className="mini" type="button" onClick={() => engine.findRoommate()} title="Find him">
            📍
          </button>
        </div>
        <Bar label="Energy" value={hud.energy} tone="energy" />
        <Bar label="Fun" value={hud.fun} tone="fun" />
        <p className="doing">
          <span>{hud.activityIcon}</span> {hud.activity}
          {hud.activityProgress > 0 && (
            <span className="doing-track">
              <span style={{ width: `${hud.activityProgress * 100}%` }} />
            </span>
          )}
        </p>
        {hud.queue.length > 0 && (
          <ol className="queue">
            {hud.queue.map((q) => (
              <li key={q.uid} className={q.uid === hud.currentUid ? "now" : ""}>
                <button type="button" onClick={() => engine.cancel(q.uid)} title={`Cancel: ${q.label}`}>
                  <span>{q.icon}</span>
                  <i>×</i>
                </button>
              </li>
            ))}
          </ol>
        )}
      </section>

      <section className="card home">
        <div className="clean" style={{ ["--pct" as string]: pct }}>
          <strong>{pct}</strong>
        </div>
        <div className="home-text">
          <h2>{grade}</h2>
          <p>
            Day {hud.day} · {hud.clock}
          </p>
          <p className="stars">
            ⭐ {hud.stars} <span>· {hud.choresDone} chores</span>
          </p>
        </div>
        <div className="speed" role="group" aria-label="Game speed">
          {[
            [0, "⏸"],
            [1, "▶"],
            [3, "⏩"],
          ].map(([s, icon]) => (
            <button
              key={s}
              type="button"
              className={hud.speed === s ? "on" : ""}
              onClick={() => engine.setSpeed(s as number)}
              aria-label={s === 0 ? "Pause" : s === 1 ? "Normal speed" : "Fast"}
            >
              {icon}
            </button>
          ))}
        </div>
      </section>

      <div className="toasts" aria-live="polite">
        {hud.toasts.map((t) => (
          <div key={t.id} className="toast">
            {t.text}
          </div>
        ))}
      </div>

      <nav className="tools" aria-label="Camera" data-open={toolsOpen ? "1" : "0"}>
        <button type="button" className={`tools-toggle${toolsOpen ? " on" : ""}`} onClick={() => setToolsOpen(!toolsOpen)} aria-expanded={toolsOpen} title="View options">
          {toolsOpen ? "✕" : "⚙️"}
        </button>
        <button type="button" onClick={() => engine.rotate(-1)} title="Rotate left">
          ↺
        </button>
        <button type="button" onClick={() => engine.rotate(1)} title="Rotate right">
          ↻
        </button>
        <button type="button" onClick={() => engine.zoom(1)} title="Zoom in">
          ＋
        </button>
        <button type="button" onClick={() => engine.zoom(-1)} title="Zoom out">
          －
        </button>
        <button type="button" onClick={() => engine.overview()} title="Whole apartment">
          🏠
        </button>
        <button type="button" className={hud.wallsUp ? "on" : ""} onClick={() => engine.toggleWalls()} title="Walls up / down">
          🧱
        </button>
        <button type="button" className={hud.ink ? "on" : ""} onClick={() => engine.toggleInk()} title="Switch between the real scan and the video game version">
          🎨
        </button>
        <button type="button" className={hud.follow ? "on" : ""} onClick={() => engine.toggleFollow()} title="Follow him">
          🎥
        </button>
        <button type="button" className={hud.sound ? "on" : ""} onClick={() => engine.toggleSound()} title="Sound">
          {hud.sound ? "🔊" : "🔇"}
        </button>
      </nav>

      <section className="dock" data-tab={tab}>
        <div className="dock-tabs" role="tablist" aria-label="Actions">
          {(
            [
              ["chores", "🧽", "Chores"],
              ["treats", "🍕", "Treats"],
              ["chaos", "🎉", "Chaos"],
            ] as const
          ).map(([id, icon, label]) => (
            <button key={id} type="button" role="tab" aria-selected={tab === id} className={tab === id ? "on" : ""} onClick={() => setTab(id)}>
              <span>{icon}</span> {label}
            </button>
          ))}
        </div>
        <div className="dock-row" data-group="chores">
          <span className="dock-title">Chores</span>
          {CHORES.map(dockButton)}
        </div>
        <div className="dock-row" data-group="treats">
          <span className="dock-title">Treats</span>
          {FUN.map(dockButton)}
          <button
            type="button"
            className="dock-btn bribe"
            disabled={hud.pizzaCooldown > 0}
            onClick={() => engine.pizza()}
            title="Instant morale. Has a cooldown."
          >
            <span className="dock-icon">🍕</span>
            <span className="dock-label">{hud.pizzaCooldown > 0 ? `Pizza in ${Math.ceil(hud.pizzaCooldown)}s` : "Bribe with pizza"}</span>
          </button>
        </div>
        <div className="dock-row" data-group="chaos">
          <span className="dock-title">Chaos</span>
          <button
            type="button"
            className={`dock-btn party${hud.party ? " on" : ""}`}
            onClick={() => engine.toggleParty()}
            title="Friends come over, the lights go disco, everybody dances"
          >
            <span className="dock-icon">{hud.party ? "🚪" : "🎉"}</span>
            <span className="dock-label">{hud.party ? `End the party (${Math.ceil(hud.partyLeft)}s)` : "Throw a party"}</span>
          </button>
          <button
            type="button"
            className="dock-btn eric"
            disabled={hud.spinning}
            onClick={() => engine.ericHome()}
            title="Eric walks in and everything starts spinning"
          >
            <span className="dock-icon">🌀</span>
            <span className="dock-label">{hud.spinning ? "Wheeeee" : "Eric got home"}</span>
          </button>
          <button
            type="button"
            className={`dock-btn ericparty${hud.ericParty ? " on" : ""}`}
            disabled={hud.spinning}
            onClick={() => engine.toggleEricParty()}
            title="Eric brings company back to the red bedroom"
          >
            <span className="dock-icon">{hud.ericParty ? "🚪" : "😈"}</span>
            <span className="dock-label">{hud.ericParty ? "Kick them out" : "Eric party"}</span>
          </button>
        </div>
      </section>
    </div>
  );
}
