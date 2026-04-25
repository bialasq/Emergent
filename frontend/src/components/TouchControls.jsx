// Touch / mobile control overlay — shown only on touch devices.
import React from "react";
import { ChevronUp, ChevronDown, ChevronLeft, ChevronRight, Pause, Heart, Sparkles } from "lucide-react";

const isTouch = typeof window !== "undefined" && (
  window.matchMedia?.("(hover: none) and (pointer: coarse)").matches ||
  "ontouchstart" in window
);

function fireKey(key) {
  const evt = new KeyboardEvent("keydown", { key, bubbles: true });
  window.dispatchEvent(evt);
}

export default function TouchControls({ visible }) {
  if (!visible && !isTouch) return null;
  const Btn = ({ onTap, children, cls = "", ...rest }) => (
    <button
      onTouchStart={(e) => { e.preventDefault(); onTap(); }}
      onClick={(e) => { e.preventDefault(); onTap(); }}
      className={`pointer-events-auto select-none w-14 h-14 flex items-center justify-center bg-dungeon-stone/90 border border-dungeon-blood/60 text-dungeon-parchment active:bg-dungeon-blood/40 ${cls}`}
      {...rest}
    >
      {children}
    </button>
  );
  return (
    <div className="fixed inset-0 pointer-events-none z-30 select-none" data-testid="touch-controls">
      {/* D-pad bottom-left */}
      <div className="absolute bottom-4 left-4 grid grid-cols-3 gap-1.5">
        <span />
        <Btn onTap={() => fireKey("ArrowUp")} data-testid="touch-up"><ChevronUp className="w-5 h-5" /></Btn>
        <span />
        <Btn onTap={() => fireKey("ArrowLeft")} data-testid="touch-left"><ChevronLeft className="w-5 h-5" /></Btn>
        <Btn onTap={() => fireKey(" ")} data-testid="touch-wait"><span className="font-heading text-xs">·</span></Btn>
        <Btn onTap={() => fireKey("ArrowRight")} data-testid="touch-right"><ChevronRight className="w-5 h-5" /></Btn>
        <span />
        <Btn onTap={() => fireKey("ArrowDown")} data-testid="touch-down"><ChevronDown className="w-5 h-5" /></Btn>
        <span />
      </div>
      {/* Action buttons bottom-right */}
      <div className="absolute bottom-4 right-4 grid grid-cols-2 gap-1.5">
        <Btn onTap={() => fireKey("h")} cls="!w-12 !h-12 !text-[10px] flex-col" data-testid="touch-heal">
          <Heart className="w-4 h-4" /><span>H</span>
        </Btn>
        <Btn onTap={() => fireKey("l")} cls="!w-12 !h-12 !text-[10px] flex-col" data-testid="touch-light">
          <Sparkles className="w-4 h-4" /><span>L</span>
        </Btn>
        <Btn onTap={() => fireKey("q")} cls="!w-12 !h-12" data-testid="touch-potion">
          <span className="text-dungeon-blood">!</span>
        </Btn>
        <Btn onTap={() => fireKey("Escape")} cls="!w-12 !h-12" data-testid="touch-pause">
          <Pause className="w-4 h-4" />
        </Btn>
      </div>
    </div>
  );
}
